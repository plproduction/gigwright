import { db } from "@/lib/db";
import { formatLongDate, formatTime, mapLink } from "@/lib/format";

// Gig-update fanout. Sends an email to every musician on the gig who has
// notifyByEmail = true and an email on file. Writes an Activity entry
// summarizing who got notified.
//
// SMS is stubbed (skipped) until Twilio 10DLC approves — when it does, the
// SMS branch wires in right here without touching callers.

type FanoutOpts = {
  gigId: string;
  triggerLabel?: string; // e.g. "Time changed" or "Set list updated"
  message?: string; // bandleader's free-form note for this update — rendered at the top
  includeLeader?: boolean; // usually false (don't spam yourself)
};

type FanoutResult = {
  emailsSent: number;
  emailsSkipped: number;
  smsSent: number;
  smsSkipped: number;
  recipients: string[];
  errors: Array<{ name: string; message: string; channel?: "email" | "sms" }>;
};

export async function fanOutGigUpdate(
  opts: FanoutOpts,
): Promise<FanoutResult> {
  const gig = await db.gig.findUnique({
    where: { id: opts.gigId },
    include: {
      venue: true,
      owner: { select: { name: true, email: true, senderEmail: true } },
      personnel: {
        include: { musician: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!gig) throw new Error("Gig not found");

  // Lineup: who's on the gig. Each musician gets a "Drew Tucker — Drums"
  // line; the leader is tagged so musicians can tell at a glance who's
  // driving. We use the per-row roleLabel if present, else the musician's
  // first role from their roster card.
  const lineup = gig.personnel.map((p) => ({
    name: p.musician.name,
    role: p.roleLabel ?? p.musician.roles[0] ?? null,
    isLeader: p.musician.isLeader,
  }));

  // Single source of truth for the email context — used for both each
  // musician's send AND the bandleader's self-copy at the end. Only the
  // recipient's first name varies between sends.
  function buildCtx(over: { firstName: string }): Ctx {
    return {
      firstName: over.firstName,
      bandleader,
      triggerLabel: opts.triggerLabel,
      message: opts.message,
      gigId: gig!.id,
      venueName: gig!.venue?.name ?? "Venue TBD",
      venueAddress: [
        gig!.venue?.addressL1,
        [gig!.venue?.city, gig!.venue?.state].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join(", "),
      mapLink: mapLink(gig!.venue ?? {}),
      longDate: formatLongDate(gig!.startAt),
      loadIn: gig!.loadInAt ? formatTime(gig!.loadInAt) : null,
      soundcheck: gig!.soundcheckAt ? formatTime(gig!.soundcheckAt) : null,
      call: gig!.callTimeAt ? formatTime(gig!.callTimeAt) : null,
      downbeat: formatTime(gig!.startAt),
      attire: gig!.attire,
      loadingInfo: gig!.loadingInfo,
      loadingMapLink: gig!.loadingMapLink,
      setlistUrl: gig!.setlistUrl,
      setlistFileName: gig!.setlistFileName,
      materialsUrl: gig!.materialsUrl,
      notes: gig!.notes,
      lineup,
    };
  }

  const bandleader =
    gig.owner?.name ?? gig.owner?.email?.split("@")[0] ?? "Your bandleader";

  const apiKey = process.env.AUTH_RESEND_KEY;
  // Sender resolution: if the bandleader has a custom senderEmail set
  // (and its domain is verified at Resend), send as "Name" <their@addr>.
  // Otherwise use the standardized GigWright sender with the bandleader's
  // name attributed in the display: "Name via GigWright" <gigs@gigwright.com>.
  const fallbackFrom = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const useOwnDomain = !!gig.owner?.senderEmail;
  const fromAddress = useOwnDomain ? gig.owner!.senderEmail! : fallbackFrom;
  const baseName = (gig.owner?.name ?? bandleader).replace(/"/g, '\\"');
  const fromName = useOwnDomain ? baseName : `${baseName} via GigWright`;
  const from = `"${fromName}" <${fromAddress}>`;
  const replyTo = gig.owner?.email ?? undefined;

  const result: FanoutResult = {
    emailsSent: 0,
    emailsSkipped: 0,
    smsSent: 0,
    smsSkipped: 0,
    recipients: [],
    errors: [],
  };

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
  const smsEnabled = !!(
    twilioSid &&
    twilioToken &&
    (twilioMessagingServiceSid || twilioFromNumber)
  );

  for (const p of gig.personnel) {
    if (!opts.includeLeader && p.musician.isLeader) continue;
    if (!p.musician.notifyByEmail) {
      result.emailsSkipped++;
      continue;
    }
    if (!p.musician.email) {
      result.emailsSkipped++;
      continue;
    }
    try {
      const subject = opts.triggerLabel
        ? `GigWright · ${opts.triggerLabel} · ${gig.venue?.name ?? "Gig"} ${formatDayShort(gig.startAt)}`
        : `GigWright · ${gig.venue?.name ?? "Gig"} ${formatDayShort(gig.startAt)}`;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: p.musician.email,
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject,
          html: renderHtml(buildCtx({
            firstName: p.musician.name.split(" ")[0] ?? p.musician.name,
          })),
          text: renderText(buildCtx({
            firstName: p.musician.name.split(" ")[0] ?? p.musician.name,
          })),
        }),
      });
      if (!emailRes.ok) {
        const detail = await emailRes.text().catch(() => "");
        result.errors.push({
          name: p.musician.name,
          channel: "email",
          message: `Resend ${emailRes.status}: ${detail.slice(0, 240)}`,
        });
      } else {
        result.emailsSent++;
        result.recipients.push(p.musician.name);
      }
    } catch (err) {
      result.errors.push({
        name: p.musician.name,
        channel: "email",
        message: err instanceof Error ? err.message : "unknown",
      });
    }

    // SMS branch — sends a short text via Twilio for any musician who has
    // notifyBySms=true and a phone on file. Skips silently if Twilio creds
    // aren't fully configured (e.g. AUTH_TOKEN missing or 10DLC pending).
    if (!smsEnabled) {
      result.smsSkipped++;
    } else if (!p.musician.notifyBySms) {
      result.smsSkipped++;
    } else if (!p.musician.phone) {
      result.smsSkipped++;
    } else {
      try {
        const to = normalizePhone(p.musician.phone);
        const body = renderSms({
          firstName: p.musician.name.split(" ")[0] ?? p.musician.name,
          bandleader,
          triggerLabel: opts.triggerLabel,
          gigId: gig.id,
          venueName: gig.venue?.name ?? "Venue TBD",
          longDate: formatLongDate(gig.startAt),
          downbeat: formatTime(gig.startAt),
        });
        const form = new URLSearchParams();
        form.set("To", to);
        form.set("Body", body);
        if (twilioMessagingServiceSid) {
          form.set("MessagingServiceSid", twilioMessagingServiceSid);
        } else if (twilioFromNumber) {
          form.set("From", twilioFromNumber);
        }
        const smsRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization:
                "Basic " +
                Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
            },
            body: form.toString(),
          },
        );
        if (!smsRes.ok) {
          const detail = await smsRes.text().catch(() => "");
          result.errors.push({
            name: p.musician.name,
            channel: "sms",
            message: `Twilio ${smsRes.status}: ${detail.slice(0, 240)}`,
          });
        } else {
          result.smsSent++;
        }
      } catch (err) {
        result.errors.push({
          name: p.musician.name,
          channel: "sms",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  // Self-copy to the bandleader so they can see exactly what their musicians
  // are getting — same template, with a `[your copy]` subject prefix and a
  // "Sent to: …" footer listing recipients. Skipped if the owner has no
  // email on file or AUTH_RESEND_KEY is missing.
  if (gig.owner?.email && apiKey) {
    try {
      const subject = opts.triggerLabel
        ? `[your copy] GigWright · ${opts.triggerLabel} · ${gig.venue?.name ?? "Gig"} ${formatDayShort(gig.startAt)}`
        : `[your copy] GigWright · ${gig.venue?.name ?? "Gig"} ${formatDayShort(gig.startAt)}`;
      const ctx = buildCtx({
        firstName: bandleader.split(" ")[0] ?? bandleader,
      });
      const recipientLine =
        result.recipients.length > 0
          ? `Sent to: ${result.recipients.join(", ")}`
          : "No musicians on the gig had an email on file.";
      const html = renderHtml(ctx).replace(
        '<!--RECIPIENTS-->',
        `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;font-size:12px;color:#888;line-height:1.5">${escapeHtml(recipientLine)}</p>`,
      );
      const text = renderText(ctx) + `\n\n${recipientLine}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: gig.owner.email,
          subject,
          html,
          text,
        }),
      });
    } catch {
      // Silent — self-copy is a convenience, not critical. If it fails,
      // we still log the main fanout activity below.
    }
  }

  await db.activity.create({
    data: {
      gigId: opts.gigId,
      action: "fanout_sent",
      summary: `Emailed ${result.emailsSent} · Texted ${result.smsSent} · ${
        opts.triggerLabel ?? "update"
      }`,
      payload: { triggerLabel: opts.triggerLabel, ...result } as object,
    },
  });

  return result;
}

// ── templates ─────────────────────────────────────────────────

type Ctx = {
  firstName: string;
  bandleader: string;
  triggerLabel?: string;
  message?: string; // bandleader's free-form note for this update
  gigId: string;
  venueName: string;
  venueAddress: string;
  mapLink: string | null;
  longDate: string;
  loadIn: string | null;
  soundcheck: string | null;
  call: string | null;
  downbeat: string;
  attire: string | null;
  loadingInfo: string | null;
  loadingMapLink: string | null;
  setlistUrl: string | null;
  setlistFileName: string | null;
  materialsUrl: string | null;
  notes: string | null;
  lineup: Array<{ name: string; role: string | null; isLeader: boolean }>;
};

// Standard explanation for "Sound check" — always travels with the term so
// musicians know exactly what's expected at that time. Same wording in HTML
// and text emails so there's one source of truth.
const SOUNDCHECK_EXPLAINER =
  "all lines run, instruments set up, ready to play at this time";

// Roster names are sometimes lowercased ("patrick"). Rendered emails should
// always greet with proper case ("Patrick"). Handles unicode-safe first-char
// capitalization.
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

function renderText(c: Ctx): string {
  const lines: string[] = [];
  lines.push(`Hi ${capitalize(c.firstName)},`);
  lines.push("");

  // The bandleader's message comes FIRST — that's the "new info" they're
  // pushing out, and it's what the band cares about most. The structural
  // gig details follow as a reference.
  if (c.message) {
    lines.push(c.message.trim());
    lines.push("");
    lines.push("───");
    lines.push("");
  } else if (c.triggerLabel) {
    lines.push(`Update from ${c.bandleader}: ${c.triggerLabel}.`);
    lines.push("");
  } else {
    lines.push(`Gig info from ${c.bandleader}:`);
    lines.push("");
  }

  // Meat and potatoes — date, venue, map.
  lines.push(`📅 ${c.longDate}`);
  lines.push(`📍 ${c.venueName}${c.venueAddress ? ` — ${c.venueAddress}` : ""}`);
  if (c.mapLink) lines.push(`   Map: ${c.mapLink}`);
  lines.push("");

  // Times. The soundcheck line ALWAYS includes the explainer so musicians
  // know what "soundcheck" means in this band's vocabulary.
  if (c.loadIn) lines.push(`Load in:     ${c.loadIn}`);
  if (c.soundcheck) {
    lines.push(`Sound check: ${c.soundcheck}`);
    lines.push(`             (${SOUNDCHECK_EXPLAINER})`);
  }
  if (c.call) lines.push(`Call:        ${c.call}`);
  lines.push(`Downbeat:    ${c.downbeat}`);
  if (c.attire) {
    lines.push("");
    lines.push(`Attire: ${c.attire}`);
  }

  // Combined "Special loading info & notes" — merged single section.
  if (c.loadingInfo || c.loadingMapLink || c.notes) {
    lines.push("");
    lines.push(`Special loading info & notes:`);
    if (c.loadingInfo) lines.push(`  ${c.loadingInfo.replace(/\n/g, "\n  ")}`);
    if (c.notes) {
      if (c.loadingInfo) lines.push("");
      lines.push(`  ${c.notes.replace(/\n/g, "\n  ")}`);
    }
    if (c.loadingMapLink) {
      if (c.loadingInfo || c.notes) lines.push("");
      lines.push(`  Load-in map: ${c.loadingMapLink}`);
    }
  }

  // Set list + materials — clickable links if set.
  if (c.setlistUrl) {
    lines.push("");
    lines.push(`Set list: ${c.setlistFileName ?? "Open set list"}`);
    lines.push(`  ${c.setlistUrl}`);
  }
  if (c.materialsUrl) {
    lines.push("");
    lines.push(`Gig materials folder:`);
    lines.push(`  ${c.materialsUrl}`);
  }

  // (notes is now merged into the combined loading info & notes section above.)

  // Lineup — who's on the gig.
  if (c.lineup.length > 0) {
    lines.push("");
    lines.push(`Lineup:`);
    for (const m of c.lineup) {
      const tag = m.isLeader ? " (leader)" : "";
      const role = m.role ? ` — ${m.role}` : "";
      lines.push(`  • ${m.name}${role}${tag}`);
    }
  }

  lines.push("");
  lines.push(`Full gig sheet (no login needed):`);
  lines.push(`https://gigwright.com/g/${c.gigId}`);
  lines.push("");
  lines.push(`— GigWright, on behalf of ${c.bandleader}`);
  return lines.join("\n");
}

function renderHtml(c: Ctx): string {
  // Order: Greeting → Bandleader's message (top, highlighted) → Venue+date
  // → Times → Attire → Load-in spot → Lineup → Footer.
  // Cut: pay, W-9, set list link, materials link, sound engineer, gig.notes.
  const mapLine = c.mapLink
    ? `<p style="margin:4px 0 0"><a href="${c.mapLink}" style="color:#7E2418;font-size:13px;font-weight:600">Open in Maps →</a></p>`
    : "";
  const messageBlock = c.message
    ? `<div style="margin:20px 0 0;padding:16px 18px;background:#F4E1DB;border:1px solid #7E2418;border-radius:8px;color:#3a1109;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(c.message.trim())}</div>`
    : "";
  const triggerLine =
    !c.message && c.triggerLabel
      ? `<p style="margin:16px 0 0;padding:8px 12px;background:#F4E1DB;border:1px solid #7E2418;border-radius:6px;color:#7E2418;font-size:13px;font-weight:600">${escapeHtml(c.triggerLabel)}</p>`
      : "";
  const triggerSubline =
    c.message && c.triggerLabel
      ? `<p style="margin:8px 0 0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em">${escapeHtml(c.triggerLabel)}</p>`
      : "";
  // Combined "Special loading info & notes" block. The bandleader sets
  // these on the gig as one mental category — anything-extra-the-band-needs
  // — so they render together in the email too. If only one of the three
  // pieces is set, the block still renders cleanly.
  const loadingNotesBody = [
    c.loadingInfo
      ? `<p style="margin:0;font-size:13px;color:#111;line-height:1.55;white-space:pre-wrap">${escapeHtml(c.loadingInfo)}</p>`
      : "",
    c.notes
      ? `<p style="margin:${c.loadingInfo ? "10px" : "0"} 0 0;font-size:13px;color:#494336;line-height:1.55;white-space:pre-wrap">${escapeHtml(c.notes)}</p>`
      : "",
    c.loadingMapLink
      ? `<p style="margin:${c.loadingInfo || c.notes ? "10px" : "0"} 0 0;font-size:12px"><a href="${c.loadingMapLink}" style="color:#7E2418;font-weight:600;text-decoration:underline">📍 Open load-in map →</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const loadingNotesBlock =
    c.loadingInfo || c.loadingMapLink || c.notes
      ? `<div style="margin:16px 0 0;padding:14px 16px;background:#F8F4EC;border:1px solid #E5E2D8;border-radius:6px">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#7E2418;text-transform:uppercase">Special loading info &amp; notes</p>
          ${loadingNotesBody}
        </div>`
      : "";

  // Set list + materials — simple, clickable links rendered as a small
  // stacked block so they're easy to tap on mobile.
  const linksBlock =
    c.setlistUrl || c.materialsUrl
      ? `<div style="margin:16px 0 0">
          ${c.setlistUrl ? `<p style="margin:0 0 6px"><a href="${c.setlistUrl}" style="color:#7E2418;font-weight:600;text-decoration:underline">📄 ${escapeHtml(c.setlistFileName ?? "Open set list")}</a></p>` : ""}
          ${c.materialsUrl ? `<p style="margin:0"><a href="${c.materialsUrl}" style="color:#7E2418;font-weight:600;text-decoration:underline">📁 Gig materials folder →</a></p>` : ""}
        </div>`
      : "";

  // (notes is now merged into the combined loadingNotesBlock above.)
  const lineupBlock =
    c.lineup.length > 0
      ? `<div style="margin:20px 0 0;padding-top:16px;border-top:1px solid #E5E2D8">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#888;text-transform:uppercase">Lineup</p>
          <ul style="margin:0;padding:0;list-style:none;font-size:13px;color:#111;line-height:1.7">
            ${c.lineup
              .map(
                (m) =>
                  `<li>${escapeHtml(m.name)}${m.role ? ` <span style="color:#888">— ${escapeHtml(m.role)}</span>` : ""}${m.isLeader ? ` <span style="color:#7E2418;font-size:11px;font-weight:600">· leader</span>` : ""}</li>`,
              )
              .join("")}
          </ul>
        </div>`
      : "";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.02em;padding-bottom:14px;border-bottom:1px solid #E5E2D8;color:#111">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <p style="font-size:14px;color:#111;margin:20px 0 0">Hi ${escapeHtml(capitalize(c.firstName))},</p>

      ${messageBlock}
      ${triggerLine}
      ${triggerSubline}

      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.02em;line-height:1.15;margin:24px 0 4px;color:#111">
        ${escapeHtml(c.venueName)}
      </h1>
      <p style="color:#555;font-size:14px;margin:0 0 6px">${escapeHtml(c.longDate)}</p>
      ${c.venueAddress ? `<p style="margin:0;font-size:13px;color:#555">${escapeHtml(c.venueAddress)}</p>` : ""}
      ${mapLine}

      <table style="width:100%;margin-top:20px;border-top:1px solid #E5E2D8;border-collapse:collapse;font-size:14px">
        ${c.loadIn ? `<tr><td style="color:#555;padding:6px 0">Load in</td><td style="color:#111;text-align:right;padding:6px 0">${escapeHtml(c.loadIn)}</td></tr>` : ""}
        ${c.soundcheck ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Sound check<br/><span style="font-size:11px;color:#888;font-style:italic">${SOUNDCHECK_EXPLAINER}</span></td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8;vertical-align:top">${escapeHtml(c.soundcheck)}</td></tr>` : ""}
        ${c.call ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Call</td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8">${escapeHtml(c.call)}</td></tr>` : ""}
        <tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8"><strong>Downbeat</strong></td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8"><strong>${escapeHtml(c.downbeat)}</strong></td></tr>
        ${c.attire ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Attire</td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8">${escapeHtml(c.attire)}</td></tr>` : ""}
      </table>

      ${loadingNotesBlock}
      ${linksBlock}
      ${lineupBlock}

      <!--RECIPIENTS-->

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E2D8;font-size:11px;color:#888;line-height:1.5">
        <p style="margin:0">
          <a href="https://gigwright.com/g/${c.gigId}" style="color:#7E2418">View the full gig sheet on GigWright →</a>
        </p>
        <p style="margin:8px 0 0">Sent on behalf of <strong>${escapeHtml(c.bandleader)}</strong>.</p>
      </div>
    </div>
  </body>
</html>`;
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Normalize a phone string to E.164 (+15035551234). If it already starts
// with "+", trust it. Otherwise strip non-digits and prepend "+1" — works
// for the US-only roster GigWright targets today.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^0-9]/g, "");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+1${digits}`;
}

function renderSms(c: {
  firstName: string;
  bandleader: string;
  triggerLabel?: string;
  gigId: string;
  venueName: string;
  longDate: string;
  downbeat: string;
}): string {
  const lead = c.triggerLabel
    ? `${c.bandleader}: ${c.triggerLabel}`
    : `${c.bandleader} sent gig info`;
  return `${lead}\n${c.venueName} · ${c.longDate} · ${c.downbeat}\nFull sheet: https://gigwright.com/g/${c.gigId}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
      soundcheckEnd: gig!.soundcheckEndAt ? formatTime(gig!.soundcheckEndAt) : null,
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
  soundcheckEnd: string | null;
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
  if (c.soundcheckEnd) {
    lines.push(`Sound check complete: ${c.soundcheckEnd}`);
    lines.push(`             (band is freed up after this time)`);
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

  // Set list + materials — ALWAYS show both. If a real URL is posted, link
  // to it directly; if not, point at the gig sheet so the band can refresh
  // there when the file lands.
  const gigSheetUrl = `https://gigwright.com/g/${c.gigId}`;
  lines.push("");
  if (c.setlistUrl) {
    lines.push(`Set list: ${c.setlistFileName ?? "Open set list"}`);
    lines.push(`  ${c.setlistUrl}`);
  } else {
    lines.push(`Set list: not yet posted — view gig sheet for updates`);
    lines.push(`  ${gigSheetUrl}`);
  }
  if (c.materialsUrl) {
    lines.push("");
    lines.push(`Gig materials folder:`);
    lines.push(`  ${c.materialsUrl}`);
  } else {
    lines.push("");
    lines.push(`Gig materials: not yet posted — view gig sheet for updates`);
    lines.push(`  ${gigSheetUrl}`);
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
  // Editorial layout — feels like a personal letter, not a system email.
  //   1. Wordmark header
  //   2. Eyebrow tag (GREETINGS / DOWNBEAT CHANGE / etc.) on its own line
  //   3. Greeting + bandleader's message in a quiet cream panel
  //   4. Venue name display (large Georgia) + date + address + map
  //   5. Schedule table with Downbeat highlighted as the main event
  //   6. Special loading info / notes (if present)
  //   7. Set list + materials as proper button-style CTAs
  //   8. Lineup as a refined list
  //   9. Footer with full-sheet link and "sent on behalf of" attribution
  // Every section uses the same restrained palette and breathing room so
  // the whole piece reads as one coherent, professional document.

  const ACCENT = "#7E2418";
  const INK = "#0E0C09";
  const INK_SOFT = "#4A453C";
  const INK_MUTE = "#8A8576";
  const LINE = "#E5E2D8";
  const LINE_SOFT = "#F0EBE0";
  const PAPER = "#F3EFE6";
  const PAPER_WARM = "#FAF6EC";
  const BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif";

  // Editorial-style "eyebrow" label — small caps in accent color. Used as
  // a section header throughout the email so each block has a quiet
  // wayfinder above it. Returns a <p> tag with its own margin reset so
  // callers don't have to wrap it.
  const eyebrow = (text: string) =>
    `<p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:11px;font-weight:700;letter-spacing:0.22em;color:${ACCENT};text-transform:uppercase;line-height:1.4">${escapeHtml(text)}</p>`;

  // ── Eyebrow / greeting block ───────────────────────────────────────
  const triggerHeading = c.triggerLabel
    ? `<tr><td style="padding:28px 32px 0">${eyebrow(c.triggerLabel)}</td></tr>`
    : "";

  const greetingInner = c.message
    ? `<p style="margin:0 0 12px;font-family:${BODY_FONT};font-size:16px;color:${INK}">Hi ${escapeHtml(capitalize(c.firstName))},</p>
       <div style="font-family:${BODY_FONT};font-size:15px;line-height:1.65;color:${INK};white-space:pre-wrap">${escapeHtml(c.message.trim())}</div>`
    : `<p style="margin:0;font-family:${BODY_FONT};font-size:16px;color:${INK}">Hi ${escapeHtml(capitalize(c.firstName))},</p>`;

  const greetingRow = `<tr><td style="padding:${c.triggerLabel ? "4px" : "28px"} 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-left:3px solid ${ACCENT};border-radius:2px">
      <tr><td style="padding:22px 24px">${greetingInner}</td></tr>
    </table>
  </td></tr>`;

  // ── Venue display ──────────────────────────────────────────────────
  const venueRow = `<tr><td style="padding:32px 32px 0">
    <h1 style="margin:0;font-family:${BODY_FONT};font-size:30px;font-weight:400;line-height:1.15;letter-spacing:-0.01em;color:${INK}">${escapeHtml(c.venueName)}</h1>
    <p style="margin:8px 0 0;font-family:${BODY_FONT};font-size:15px;color:${INK_SOFT};line-height:1.5">${escapeHtml(c.longDate)}</p>
    ${c.venueAddress ? `<p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:14px;color:${INK_SOFT};line-height:1.5">${escapeHtml(c.venueAddress)}</p>` : ""}
    ${c.mapLink ? `<p style="margin:10px 0 0"><a href="${c.mapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">Open in Maps  →</a></p>` : ""}
  </td></tr>`;

  // ── Schedule table — Downbeat highlighted as the main event ────────
  const timeRow = (
    label: string,
    value: string,
    sub: string | null,
    opts: { emphasize?: boolean; first?: boolean } = {},
  ) => {
    const labelStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? INK : INK_SOFT};font-size:${opts.emphasize ? "14px" : "13px"};font-weight:${opts.emphasize ? 700 : 400};padding:${opts.first ? "0" : "12px"} 0 12px;${opts.first ? "" : `border-top:1px solid ${LINE_SOFT};`}letter-spacing:${opts.emphasize ? "0.04em" : "0.02em"};text-transform:${opts.emphasize ? "uppercase" : "none"};vertical-align:top`;
    const valueStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? ACCENT : INK};font-size:${opts.emphasize ? "20px" : "15px"};font-weight:${opts.emphasize ? 600 : 400};text-align:right;padding:${opts.first ? "0" : "12px"} 0 12px;${opts.first ? "" : `border-top:1px solid ${LINE_SOFT};`};vertical-align:top;font-variant-numeric:tabular-nums`;
    return `<tr>
      <td style="${labelStyle}">${escapeHtml(label)}${sub ? `<div style="margin-top:4px;font-family:${BODY_FONT};font-size:11px;font-weight:400;color:${INK_MUTE};letter-spacing:0;text-transform:none;font-style:italic;line-height:1.5">${escapeHtml(sub)}</div>` : ""}</td>
      <td style="${valueStyle}">${escapeHtml(value)}</td>
    </tr>`;
  };

  const scheduleRows: string[] = [];
  let isFirst = true;
  if (c.loadIn) {
    scheduleRows.push(timeRow("Load in", c.loadIn, null, { first: isFirst }));
    isFirst = false;
  }
  if (c.soundcheck) {
    scheduleRows.push(timeRow("Sound check", c.soundcheck, SOUNDCHECK_EXPLAINER, { first: isFirst }));
    isFirst = false;
  }
  if (c.soundcheckEnd) {
    scheduleRows.push(timeRow("Sound check complete", c.soundcheckEnd, "band is freed up after this time", { first: isFirst }));
    isFirst = false;
  }
  if (c.call) {
    scheduleRows.push(timeRow("Call", c.call, null, { first: isFirst }));
    isFirst = false;
  }
  scheduleRows.push(timeRow("Downbeat", c.downbeat, null, { emphasize: true, first: isFirst }));
  isFirst = false;
  if (c.attire) scheduleRows.push(timeRow("Attire", c.attire, null, { first: isFirst }));

  const scheduleBlock = `<tr><td style="padding:24px 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      ${scheduleRows.join("")}
    </table>
  </td></tr>`;

  // ── Loading info & notes ───────────────────────────────────────────
  const loadingNotesBody = [
    c.loadingInfo
      ? `<p style="margin:0;font-family:${BODY_FONT};font-size:14px;color:${INK};line-height:1.6;white-space:pre-wrap">${escapeHtml(c.loadingInfo)}</p>`
      : "",
    c.notes
      ? `<p style="margin:${c.loadingInfo ? "12px" : "0"} 0 0;font-family:${BODY_FONT};font-size:14px;color:${INK_SOFT};line-height:1.6;white-space:pre-wrap">${escapeHtml(c.notes)}</p>`
      : "",
    c.loadingMapLink
      ? `<p style="margin:${c.loadingInfo || c.notes ? "14px" : "0"} 0 0"><a href="${c.loadingMapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">📍  Open load-in map  →</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const loadingNotesBlock =
    c.loadingInfo || c.loadingMapLink || c.notes
      ? `<tr><td style="padding:28px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:6px">
            <tr><td style="padding:20px 24px">
              ${eyebrow("Special loading info & notes")}
              ${loadingNotesBody}
            </td></tr>
          </table>
        </td></tr>`
      : "";

  // ── Set list + materials — proper button-style CTAs ────────────────
  const gigSheetUrl = `https://gigwright.com/g/${c.gigId}`;

  // Single CTA "card" — a tappable link styled like a button row. The
  // `last` flag drops the bottom margin so the second card sits flush.
  const ctaButton = (
    icon: string,
    label: string,
    sublabel: string | null,
    href: string,
    last: boolean,
  ) => `<a href="${href}" style="display:block;text-decoration:none;background:#FFFFFF;border:1px solid ${LINE};border-radius:8px;padding:16px 18px;margin:0 0 ${last ? "0" : "10px"};color:${INK};font-family:${BODY_FONT}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:18px;width:32px;vertical-align:middle;line-height:1">${icon}</td>
            <td style="vertical-align:middle">
              <div style="font-family:${BODY_FONT};font-size:14px;font-weight:700;color:${ACCENT};line-height:1.3;letter-spacing:0.01em">${escapeHtml(label)}</div>
              ${sublabel ? `<div style="font-family:${BODY_FONT};font-size:12px;color:${INK_MUTE};line-height:1.5;margin-top:3px">${escapeHtml(sublabel)}</div>` : ""}
            </td>
            <td style="text-align:right;vertical-align:middle;font-family:${BODY_FONT};color:${ACCENT};font-size:18px;width:24px">→</td>
          </tr>
        </table>
      </a>`;

  const setlistCta = c.setlistUrl
    ? ctaButton("📄", c.setlistFileName ?? "Open set list", "PDF · view or download", c.setlistUrl, false)
    : ctaButton("📄", "Set list", "Posts before downbeat — view on gig sheet", gigSheetUrl, false);
  const materialsCta = c.materialsUrl
    ? ctaButton("📁", "Gig materials folder", "Charts, audio, references", c.materialsUrl, true)
    : ctaButton("📁", "Gig materials", "Posts when ready — view on gig sheet", gigSheetUrl, true);

  const linksBlock = `<tr><td style="padding:28px 32px 0">
    ${eyebrow("Music & materials")}
    ${setlistCta}
    ${materialsCta}
  </td></tr>`;

  // ── Lineup ─────────────────────────────────────────────────────────
  const lineupRows = c.lineup
    .map(
      (m, i) => `<tr>
        <td style="padding:${i === 0 ? "0" : "10px"} 0 10px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:14px;color:${INK};line-height:1.4">
          ${escapeHtml(m.name)}${m.isLeader ? ` <span style="color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-left:6px">Leader</span>` : ""}
        </td>
        <td style="padding:${i === 0 ? "0" : "10px"} 0 10px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:13px;color:${INK_MUTE};text-align:right;line-height:1.4">
          ${m.role ? escapeHtml(m.role) : ""}
        </td>
      </tr>`,
    )
    .join("");

  const lineupBlock =
    c.lineup.length > 0
      ? `<tr><td style="padding:28px 32px 0">
          ${eyebrow("Lineup")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            ${lineupRows}
          </table>
        </td></tr>`
      : "";

  // ── Footer ─────────────────────────────────────────────────────────
  const footerBlock = `<tr><td style="padding:32px 32px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};border-collapse:collapse">
      <tr><td style="padding:18px 0 0">
        <p style="margin:0"><a href="${gigSheetUrl}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">View the full gig sheet  →</a></p>
        <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:12px;color:${INK_MUTE};line-height:1.6">
          Sent on behalf of <span style="color:${INK_SOFT};font-weight:600">${escapeHtml(c.bandleader)}</span> via
          <a href="https://gigwright.com" style="color:${INK_MUTE};text-decoration:none;border-bottom:1px solid ${LINE}">GigWright</a> —
          the bandleader's workbench from the first call to the final payout.
        </p>
      </td></tr>
    </table>
  </td></tr>`;

  // ── Header (wordmark) ──────────────────────────────────────────────
  const headerBlock = `<tr><td style="padding:32px 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${BODY_FONT};font-size:20px;font-weight:500;letter-spacing:-0.01em;color:${INK};line-height:1">
          Gig<span style="color:${ACCENT};font-weight:300;font-style:italic">Wright</span>
        </td>
        <td style="text-align:right;font-family:${BODY_FONT};font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${INK_MUTE}">
          Gig sheet
        </td>
      </tr>
    </table>
  </td></tr>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(c.venueName)} · ${escapeHtml(c.longDate)}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${BODY_FONT};-webkit-font-smoothing:antialiased">
    <!-- Preheader (shows in inbox preview, hidden in body) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(c.venueName)} · ${escapeHtml(c.longDate)} · downbeat ${escapeHtml(c.downbeat)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.08);border-radius:12px;box-shadow:0 1px 2px rgba(14,12,9,0.04)">
          ${headerBlock}
          ${triggerHeading}
          ${greetingRow}
          ${venueRow}
          ${scheduleBlock}
          ${loadingNotesBlock}
          ${linksBlock}
          ${lineupBlock}
          ${footerBlock}
        </table>
        <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:11px;color:${INK_MUTE};text-align:center">
          You're receiving this because ${escapeHtml(c.bandleader)} added you to a gig.
        </p>
      </td></tr>
    </table>
    <!--RECIPIENTS-->
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

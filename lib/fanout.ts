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
          html: renderHtml({
            firstName: p.musician.name.split(" ")[0] ?? p.musician.name,
            bandleader,
            triggerLabel: opts.triggerLabel,
            gigId: gig.id,
            venueName: gig.venue?.name ?? "Venue TBD",
            venueAddress: [
              gig.venue?.addressL1,
              [gig.venue?.city, gig.venue?.state].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(", "),
            mapLink: mapLink(gig.venue ?? {}),
            longDate: formatLongDate(gig.startAt),
            loadIn: gig.loadInAt ? formatTime(gig.loadInAt) : null,
            soundcheck: gig.soundcheckAt ? formatTime(gig.soundcheckAt) : null,
            call: gig.callTimeAt ? formatTime(gig.callTimeAt) : null,
            downbeat: formatTime(gig.startAt),
            attire: gig.attire,
            notes: gig.notes,
            setlistUrl: gig.setlistUrl,
            setlistFileName: gig.setlistFileName,
            materialsUrl: gig.materialsUrl,
            soundContactName: gig.soundContactName,
            soundContactPhone: gig.soundContactPhone,
            myPayCents: p.musician.isLeader ? null : p.payCents,
            paidAt: p.paidAt,
            w9Received: p.musician.w9Received,
          }),
          text: renderText({
            firstName: p.musician.name.split(" ")[0] ?? p.musician.name,
            bandleader,
            triggerLabel: opts.triggerLabel,
            gigId: gig.id,
            venueName: gig.venue?.name ?? "Venue TBD",
            venueAddress: [
              gig.venue?.addressL1,
              [gig.venue?.city, gig.venue?.state].filter(Boolean).join(", "),
            ]
              .filter(Boolean)
              .join(", "),
            mapLink: mapLink(gig.venue ?? {}),
            longDate: formatLongDate(gig.startAt),
            loadIn: gig.loadInAt ? formatTime(gig.loadInAt) : null,
            soundcheck: gig.soundcheckAt ? formatTime(gig.soundcheckAt) : null,
            call: gig.callTimeAt ? formatTime(gig.callTimeAt) : null,
            downbeat: formatTime(gig.startAt),
            attire: gig.attire,
            notes: gig.notes,
            setlistUrl: gig.setlistUrl,
            setlistFileName: gig.setlistFileName,
            materialsUrl: gig.materialsUrl,
            soundContactName: gig.soundContactName,
            soundContactPhone: gig.soundContactPhone,
            myPayCents: p.musician.isLeader ? null : p.payCents,
            paidAt: p.paidAt,
            w9Received: p.musician.w9Received,
          }),
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
  notes: string | null;
  setlistUrl: string | null;
  setlistFileName: string | null;
  materialsUrl: string | null;
  soundContactName: string | null;
  soundContactPhone: string | null;
  myPayCents: number | null;
  paidAt: Date | null;
  w9Received: boolean;
};

function renderText(c: Ctx): string {
  const lines: string[] = [];
  lines.push(`Hi ${c.firstName},`);
  lines.push("");
  if (c.triggerLabel) lines.push(`Update from ${c.bandleader}: ${c.triggerLabel}.`);
  else lines.push(`Gig info from ${c.bandleader}:`);
  lines.push("");
  lines.push(`📅 ${c.longDate}`);
  lines.push(`📍 ${c.venueName}${c.venueAddress ? ` — ${c.venueAddress}` : ""}`);
  if (c.mapLink) lines.push(`   Map: ${c.mapLink}`);
  lines.push("");
  if (c.loadIn) lines.push(`Load in:     ${c.loadIn}`);
  if (c.soundcheck)
    lines.push(`Sound check: ${c.soundcheck}  (all lines run, instruments set up, ready to play)`);
  if (c.call) lines.push(`Call:        ${c.call}`);
  lines.push(`Downbeat:    ${c.downbeat}`);
  lines.push("");
  if (c.attire) lines.push(`Attire: ${c.attire}`);
  if (c.soundContactName) {
    lines.push(
      `Sound engineer: ${c.soundContactName}${c.soundContactPhone ? ` (${c.soundContactPhone})` : ""}`,
    );
  }
  if (c.setlistUrl) {
    lines.push("");
    lines.push(`Set list: ${c.setlistFileName ?? c.setlistUrl}`);
    lines.push(`   ${c.setlistUrl}`);
  }
  if (c.materialsUrl) {
    lines.push(`Gig materials: ${c.materialsUrl}`);
  }
  if (c.notes) {
    lines.push("");
    lines.push(`Notes: ${c.notes}`);
  }
  if (c.myPayCents != null) {
    lines.push("");
    lines.push(
      `Your pay: $${(c.myPayCents / 100).toFixed(
        c.myPayCents % 100 === 0 ? 0 : 2,
      )}${c.paidAt ? " (paid)" : ""}`,
    );
  }
  lines.push("");
  lines.push(
    c.w9Received
      ? "W-9: ✓ on file"
      : "W-9: not yet received — please send one if you haven't.",
  );
  lines.push("");
  lines.push(`Full gig sheet (no login needed):`);
  lines.push(`https://gigwright.com/g/${c.gigId}`);
  lines.push("");
  lines.push(`— GigWright, on behalf of ${c.bandleader}`);
  return lines.join("\n");
}

function renderHtml(c: Ctx): string {
  const pay =
    c.myPayCents != null
      ? `<tr><td style="color:#555;padding:4px 0">Your pay</td><td style="color:#111;text-align:right;padding:4px 0"><strong>$${(
          c.myPayCents / 100
        ).toFixed(c.myPayCents % 100 === 0 ? 0 : 2)}</strong>${
          c.paidAt ? ' <span style="color:#2E6B3B;font-size:11px">✓ paid</span>' : ""
        }</td></tr>`
      : "";
  const setlistLine = c.setlistUrl
    ? `<p style="margin:12px 0 0"><a href="${c.setlistUrl}" style="color:#7E2418;font-weight:600">📄 ${c.setlistFileName ?? "Open set list"}</a></p>`
    : "";
  const materialsLine = c.materialsUrl
    ? `<p style="margin:8px 0 0"><a href="${c.materialsUrl}" style="color:#7E2418;font-weight:600">Gig materials folder →</a></p>`
    : "";
  const mapLine = c.mapLink
    ? `<p style="margin:4px 0 0"><a href="${c.mapLink}" style="color:#7E2418;font-size:13px;font-weight:600">Open in Maps →</a></p>`
    : "";
  const soundLine = c.soundContactName
    ? `<p style="margin:10px 0 0;font-size:13px;color:#555">Sound engineer: <strong>${c.soundContactName}</strong>${
        c.soundContactPhone
          ? ` · <a href="tel:${c.soundContactPhone.replace(/[^0-9+]/g, "")}" style="color:#7E2418">${c.soundContactPhone}</a>`
          : ""
      }</p>`
    : "";
  const trigger = c.triggerLabel
    ? `<div style="background:#F4E1DB;border:1px solid #7E2418;border-radius:6px;padding:10px 14px;color:#7E2418;font-size:13px;font-weight:600;margin:0 0 20px">${c.triggerLabel}</div>`
    : "";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.02em;padding-bottom:14px;border-bottom:1px solid #E5E2D8;color:#111">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <p style="font-size:14px;color:#111;margin:20px 0 0">Hi ${c.firstName},</p>
      ${trigger ? `<div style="margin-top:16px">${trigger}</div>` : ""}
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.02em;line-height:1.15;margin:${trigger ? "0" : "16px"} 0 4px;color:#111">
        ${c.venueName}
      </h1>
      <p style="color:#555;font-size:14px;margin:0 0 6px">${c.longDate}</p>
      ${c.venueAddress ? `<p style="margin:0;font-size:13px;color:#555">${c.venueAddress}</p>` : ""}
      ${mapLine}

      <table style="width:100%;margin-top:20px;border-top:1px solid #E5E2D8;border-collapse:collapse;font-size:14px">
        ${c.loadIn ? `<tr><td style="color:#555;padding:6px 0">Load in</td><td style="color:#111;text-align:right;padding:6px 0">${c.loadIn}</td></tr>` : ""}
        ${c.soundcheck ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Sound check<br/><span style="font-size:11px;color:#888">all lines run, instruments set up, ready to play at this time</span></td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8;vertical-align:top">${c.soundcheck}</td></tr>` : ""}
        ${c.call ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Call</td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8">${c.call}</td></tr>` : ""}
        <tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8"><strong>Downbeat</strong></td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8"><strong>${c.downbeat}</strong></td></tr>
        ${c.attire ? `<tr><td style="color:#555;padding:6px 0;border-top:1px solid #F2EFE8">Attire</td><td style="color:#111;text-align:right;padding:6px 0;border-top:1px solid #F2EFE8">${c.attire}</td></tr>` : ""}
        ${pay ? `<tr><td colspan="2" style="border-top:1px solid #E5E2D8;padding-top:4px"></td></tr>${pay}` : ""}
      </table>

      ${setlistLine}
      ${materialsLine}
      ${soundLine}

      ${c.notes ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;font-size:13px;color:#494336;line-height:1.55;white-space:pre-wrap">${escapeHtml(c.notes)}</p>` : ""}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E2D8;font-size:11px;color:#888;line-height:1.5">
        <p style="margin:0 0 4px">${
          c.w9Received
            ? "W-9: ✓ on file"
            : "W-9: not yet received — please send one if you haven't."
        }</p>
        <p style="margin:0">
          <a href="https://gigwright.com/g/${c.gigId}" style="color:#7E2418">View the full gig sheet on GigWright →</a>
        </p>
        <p style="margin:8px 0 0">Sent on behalf of <strong>${c.bandleader}</strong>.</p>
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

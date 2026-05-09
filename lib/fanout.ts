import { db } from "@/lib/db";
import { formatLongDate, formatTime, mapLink } from "@/lib/format";
import {
  type Ctx,
  renderHtml,
  renderText,
  escapeHtml,
  titleCaseName,
} from "@/lib/email-render";

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
      finish: gig!.endAt ? formatTime(gig!.endAt) : null,
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
  // Title-case the display name so the sender header reads
  // "Patrick Lamb via GigWright" even if the user's profile is stored as
  // a lowercased "patrick lamb".
  const baseName = titleCaseName(
    (gig.owner?.name ?? bandleader).replace(/"/g, '\\"'),
  );
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

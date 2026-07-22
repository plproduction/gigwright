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
      owner: { select: { name: true, email: true, senderEmail: true, plan: true, role: true } },
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
  // Per-row "include in outgoing emails" toggle: when false, this person
  // is hidden from the Lineup section that other recipients see. They can
  // still RECEIVE the email themselves if their notify flags are on —
  // this only suppresses their info from circulating to the rest of the
  // band. Default is true, so existing rows are unaffected.
  const lineup = gig.personnel
    .filter((p) => p.includeInLineup)
    .map((p) => ({
      name: p.musician.name,
      role: p.roleLabel ?? p.musician.roles[0] ?? null,
      isLeader: p.musician.isLeader,
      phone: p.musician.phone ?? null,
      email: p.musician.email ?? null,
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
      eventName: gig!.eventName ?? null,
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
      secondDownbeat: gig!.secondStartAt ? formatTime(gig!.secondStartAt) : null,
      secondFinish: gig!.secondEndAt ? formatTime(gig!.secondEndAt) : null,
      call: gig!.callTimeAt ? formatTime(gig!.callTimeAt) : null,
      downbeat: formatTime(gig!.startAt),
      attire: gig!.attire,
      loadingInfo: gig!.loadingInfo,
      loadingMapLink: gig!.loadingMapLink,
      setlistUrl: gig!.setlistUrl,
      setlistFileName: gig!.setlistFileName,
      stagePlotUrl: gig!.stagePlotUrl,
      stagePlotFileName: gig!.stagePlotFileName,
      roomingInfo: gig!.roomingInfo,
      roomingUrl: gig!.roomingUrl,
      roomingFileName: gig!.roomingFileName,
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

  // SMS gating: requires Twilio credentials AND (a paid plan OR an
  // ADMIN-role user). Email fanout stays free on the FREE tier; only
  // SMS is reserved for paid plans. FREE owners with notifyBySms
  // musicians get the email and skip the SMS silently (counts as
  // smsSkipped).
  //
  // The ADMIN-role bypass is for Patrick + any future founder/staff
  // accounts — they shouldn't have to upgrade their own billing plan
  // to use SMS on their personal band. role=ADMIN already grants
  // cross-tenant access elsewhere; granting SMS as part of that bundle
  // keeps the founder using their own product without billing friction.
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;
  const ownerCanSendSms =
    gig.owner?.plan === "PRO" ||
    gig.owner?.plan === "ADMIN" ||
    gig.owner?.role === "ADMIN";
  const smsEnabled = !!(
    ownerCanSendSms &&
    twilioSid &&
    twilioToken &&
    (twilioMessagingServiceSid || twilioFromNumber)
  );

  for (const p of gig.personnel) {
    if (!opts.includeLeader && p.musician.isLeader) continue;

    // ── Email — the mandatory operational channel ──────────────────
    // Gig-coordination email is the baseline transport and is NOT
    // opt-out-able (musician.notifyByEmail is retained as a legacy
    // always-true column but no longer consulted here — every musician
    // with an address on file gets the email). We only skip someone who
    // has no email at all.
    //
    // CRITICAL: this block must never `continue`. Email and SMS are two
    // independent channels; the SMS branch below has to run regardless of
    // whether the email sent, was skipped, or errored. A `continue` here
    // previously blackholed a musician's text whenever they were opted
    // out of email (they fell out of the loop before the SMS branch),
    // which is the exact bug that left opted-out members getting nothing.
    if (!p.musician.email) {
      result.emailsSkipped++;
    } else {
      try {
        // Subject prefers the event name when present so the band scans
        // "Smith Wedding" or "Patrick Lamb Quartet" rather than "The
        // Funky Biscuit" three times in a row. Venue is still in the
        // body — this is just inbox-line scanning.
        const subjectHead = gig.eventName || gig.venue?.name || "Gig";
        const subject = opts.triggerLabel
          ? `GigWright · ${opts.triggerLabel} · ${subjectHead} ${formatDayShort(gig.startAt)}`
          : `GigWright · ${subjectHead} ${formatDayShort(gig.startAt)}`;
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
          eventName: gig.eventName ?? null,
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
  // email on file or AUTH_RESEND_KEY is missing. Also skipped when
  // includeLeader is true — in that mode the leader is already a regular
  // band recipient and a second "[your copy]" would just be a duplicate.
  if (gig.owner?.email && apiKey && !opts.includeLeader) {
    try {
      const subjectHead = gig.eventName || gig.venue?.name || "Gig";
      const subject = opts.triggerLabel
        ? `[your copy] GigWright · ${opts.triggerLabel} · ${subjectHead} ${formatDayShort(gig.startAt)}`
        : `[your copy] GigWright · ${subjectHead} ${formatDayShort(gig.startAt)}`;
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

  // Leader confirmation SMS — single text to the bandleader telling them
  // exactly how many people just got the alert. Mirrors the "[your copy]"
  // email above: a receipt for the sender, not a regular recipient copy.
  // Skipped silently if SMS isn't enabled, the leader doesn't have a
  // Musician row with a phone, zero SMS actually went out, or
  // includeLeader is true (the leader is already a regular recipient and
  // a second receipt SMS would just be a duplicate).
  //
  // Phone lookup: the leader is on the gig as personnel where isLeader=true.
  // We pull that record's phone since the User model doesn't store one.
  if (smsEnabled && result.smsSent > 0 && !opts.includeLeader) {
    const leaderPersonnel = gig.personnel.find(
      (p) => p.musician.isLeader && p.musician.phone,
    );
    if (leaderPersonnel?.musician.phone) {
      try {
        const subjectHead = gig.eventName || gig.venue?.name || "gig";
        const confirmBody = `GigWright: ✓ Alert sent to ${result.smsSent} musician${result.smsSent === 1 ? "" : "s"} for ${subjectHead} ${formatDayShort(gig.startAt)}. Reply STOP to opt out.`;
        const form = new URLSearchParams();
        form.set("To", normalizePhone(leaderPersonnel.musician.phone));
        form.set("Body", confirmBody);
        if (twilioMessagingServiceSid) {
          form.set("MessagingServiceSid", twilioMessagingServiceSid);
        } else if (twilioFromNumber) {
          form.set("From", twilioFromNumber);
        }
        await fetch(
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
      } catch {
        // Silent — confirmation is a convenience, not critical. The main
        // band fanout already succeeded; we don't want a confirmation
        // failure to make the activity log look broken.
      }
    }
  }

  // Payload captures enough for a proper accountability audit trail:
  // trigger label, full message body, per-channel counts, per-recipient
  // list, and any errors. The /gigs/[id]/messages page reads these
  // rows directly so the bandleader can prove "yes I told you, on
  // Tuesday at 4:32 PM." Retained forever with the gig.
  await db.activity.create({
    data: {
      gigId: opts.gigId,
      action: "fanout_sent",
      summary: `Emailed ${result.emailsSent} · Texted ${result.smsSent} · ${
        opts.triggerLabel ?? "update"
      }`,
      payload: {
        triggerLabel: opts.triggerLabel ?? null,
        message: opts.message ?? null,
        includeLeader: !!opts.includeLeader,
        ...result,
      } as object,
    },
  });

  // Persist the latest update headline + body on the gig so the public
  // sheet, musician portal, and print sheet can all render it at the
  // top. Without this, a musician taps the SMS link, lands on the
  // sheet, and sees only the static gig info — none of the actual
  // change-note the bandleader just sent. Overwritten on every fanout;
  // only the most recent matters at gig time.
  if (opts.triggerLabel || opts.message) {
    await db.gig.update({
      where: { id: opts.gigId },
      data: {
        lastUpdateLabel: opts.triggerLabel ?? null,
        lastUpdateMessage: opts.message ?? null,
        lastUpdateAt: new Date(),
      },
    });
  }

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
  eventName: string | null;
  longDate: string;
  downbeat: string;
}): string {
  const lead = c.triggerLabel
    ? `${c.bandleader}: ${c.triggerLabel}`
    : `${c.bandleader} sent gig info`;
  const placeLine = c.eventName
    ? `${c.eventName} at ${c.venueName}`
    : c.venueName;
  return `${lead}\n${placeLine} · ${c.longDate} · ${c.downbeat}\nFull sheet: https://gigwright.com/g/${c.gigId}`;
}

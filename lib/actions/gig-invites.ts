"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMoneyCents } from "@/lib/format";

// Accept/Decline gig invitations, patterned after IML/Emerald Empire
// Band. sendGigInvite() emails one musician with big Accept/Decline
// buttons that point at the public /g/[gigId]/rsvp/[token] route.
//
// The email deliberately mimics the IML shape:
//   - Subject front-loads venue + date so it's decidable from the inbox
//   - Body opens with a personal salutation, not corporate boilerplate
//   - Facts (date, venue, downbeat, PAY) go in a compact block up top
//   - Big Accept / Decline buttons at the bottom
//   - No login required to respond

export async function sendGigInvite(personnelId: string) {
  const user = await requireUser();

  const personnel = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
    include: {
      musician: true,
      gig: { include: { venue: true } },
    },
  });
  if (!personnel) throw new Error("Not found");
  if (!personnel.musician.email) {
    throw new Error(
      `${personnel.musician.name} doesn't have an email on file — add one on their roster row.`,
    );
  }

  // Generate a fresh token on every send. This means an old email's
  // links stop working after a resend — that's the intended behavior
  // (superseded email should be ignored; latest email is the source
  // of truth). Token is 32 bytes = 64 hex chars, well past the point
  // where guessing is a practical attack.
  const token = randomBytes(32).toString("hex");
  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: {
      inviteToken: token,
      invitedAt: new Date(),
      // Deliberately DON'T clear response/respondedAt on resend — if
      // they already responded, that's the truth of record. Bandleader
      // can see they responded on the payout worksheet chip.
    },
  });

  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";
  const acceptUrl = `${baseUrl}/g/${personnel.gigId}/rsvp/${token}?answer=yes`;
  const declineUrl = `${baseUrl}/g/${personnel.gigId}/rsvp/${token}?answer=no`;
  const sheetUrl = `${baseUrl}/g/${personnel.gigId}`;

  const gigDate = personnel.gig.startAt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const downbeatTime = personnel.gig.startAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const venueName = personnel.gig.venue?.name ?? "TBD";
  const eventName = personnel.gig.eventName ?? "";
  const pay = formatMoneyCents(personnel.payCents);
  const musicianFirst = personnel.musician.name.split(" ")[0];
  const bandleaderName = user.name ?? user.email;

  // Sender header — same shape used by the roster invite endpoint,
  // which we fixed on 2026-08-06. Strip display-name syntax from
  // EMAIL_FROM defensively so a nested-brackets header can't come
  // back and bite us.
  const emailFromRaw = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const fallbackFrom =
    emailFromRaw.match(/<([^>]+)>/)?.[1]?.trim() ?? emailFromRaw.trim();
  const baseName = bandleaderName.replace(/"/g, '\\"');
  const from = `"${baseName} via GigWright" <${fallbackFrom}>`;
  const replyTo = user.email ?? undefined;

  const subjectVenue = eventName || venueName;
  const subject = `Gig invite: ${subjectVenue} · ${gigDate}`;

  const html = renderInviteHtml({
    musicianFirst,
    bandleaderName,
    gigDate,
    downbeatTime,
    venueName,
    eventName,
    pay,
    acceptUrl,
    declineUrl,
    sheetUrl,
  });
  const text = renderInviteText({
    musicianFirst,
    bandleaderName,
    gigDate,
    downbeatTime,
    venueName,
    eventName,
    pay,
    acceptUrl,
    declineUrl,
    sheetUrl,
  });

  const apiKey = process.env.AUTH_RESEND_KEY;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: personnel.musician.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[gig-invite] FAILED status=${res.status} personnel=${personnelId} body=${errText}`,
    );
    throw new Error(`Resend ${res.status}: ${errText}`);
  }

  // Capture Resend's own message id so the /api/resend/webhook route
  // can correlate later email.opened / email.clicked events back to
  // this specific personnel row. Reset the tracking timestamps too —
  // a resend supersedes the previous email, so old opens shouldn't
  // pollute the new send's status.
  const sendResponse = (await res.json().catch(() => ({}))) as {
    id?: string;
  };
  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: {
      resendEmailId: sendResponse.id ?? null,
      emailOpenedAt: null,
      emailClickedAt: null,
    },
  });

  await db.activity.create({
    data: {
      gigId: personnel.gigId,
      action: "personnel_invited",
      summary: `Sent gig invite to ${personnel.musician.name}`,
    },
  });

  revalidatePath(`/gigs/${personnel.gigId}`);
  return { ok: true } as const;
}

// ————————————————————————————————————————————————————————————————
// Email templates
// ————————————————————————————————————————————————————————————————

type EmailArgs = {
  musicianFirst: string;
  bandleaderName: string;
  gigDate: string;
  downbeatTime: string;
  venueName: string;
  eventName: string;
  pay: string;
  acceptUrl: string;
  declineUrl: string;
  sheetUrl: string;
};

function renderInviteText(a: EmailArgs): string {
  const headline = a.eventName
    ? `${a.eventName} at ${a.venueName}`
    : a.venueName;
  return `Hi ${a.musicianFirst},

Here are the details for a gig I'd like to book you on. Confirmed and good to go on my end — just need to know you're in.

  Date:      ${a.gigDate}
  Downbeat:  ${a.downbeatTime}
  Location:  ${headline}
  Pay:       ${a.pay}

Full worksheet with load-in, attire, and any updates as they come in:
${a.sheetUrl}

Please respond either way so I know the lineup is locked. This email may be the only confirmation you get — put it on your calendar.

  Accept:  ${a.acceptUrl}
  Decline: ${a.declineUrl}

Hope you can play the gig.

— ${a.bandleaderName}
(Sent via GigWright)
`;
}

function renderInviteHtml(a: EmailArgs): string {
  const headline = a.eventName
    ? `${a.eventName} at ${a.venueName}`
    : a.venueName;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;padding-bottom:16px;border-bottom:1px solid #E5E2D8;">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>

      <p style="margin:20px 0 12px 0;font-size:15px;line-height:1.5;">
        Hi ${escapeHtml(a.musicianFirst)},
      </p>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3A3833;">
        Here are the details for a gig I'd like to book you on. Confirmed and good to go on my end — just need to know you're in.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0 24px 0;">
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7A776E;width:110px;">Date</td>
          <td style="padding:8px 0;font-family:Georgia,serif;font-size:17px;color:#0E0C09;">${escapeHtml(a.gigDate)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7A776E;">Downbeat</td>
          <td style="padding:8px 0;font-family:Georgia,serif;font-size:17px;color:#0E0C09;">${escapeHtml(a.downbeatTime)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7A776E;">Location</td>
          <td style="padding:8px 0;font-family:Georgia,serif;font-size:17px;color:#0E0C09;">${escapeHtml(headline)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7A776E;">Pay</td>
          <td style="padding:8px 0;font-family:Georgia,serif;font-size:22px;font-weight:300;color:#7E2418;">${escapeHtml(a.pay)}</td>
        </tr>
      </table>

      <p style="margin:0 0 24px 0;font-size:13px;line-height:1.5;color:#3A3833;">
        Full worksheet with load-in, attire, and any updates: <a href="${a.sheetUrl}" style="color:#7E2418;text-decoration:underline;">view the gig sheet</a>.
      </p>

      <div style="text-align:center;margin:32px 0 24px 0;">
        <a href="${a.acceptUrl}" style="display:inline-block;background:#2E6B3B;color:#FFFFFF;padding:14px 32px;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;margin:0 6px;">
          ✓ Accept
        </a>
        <a href="${a.declineUrl}" style="display:inline-block;background:#7A776E;color:#FFFFFF;padding:14px 32px;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;margin:0 6px;">
          Decline
        </a>
      </div>

      <p style="margin:24px 0 0 0;font-size:12px;line-height:1.5;color:#7A776E;font-style:italic;">
        Please respond either way so I know the lineup is locked. This email may be the only confirmation you get — put it on your calendar.
      </p>

      <p style="margin:24px 0 0 0;font-size:13px;line-height:1.5;color:#0E0C09;">
        Hope you can play the gig.<br/>
        — ${escapeHtml(a.bandleaderName)}
      </p>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E2D8;font-size:11px;color:#7A776E;">
        Sent via GigWright.
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// POST /api/musicians/[id]/invite
// Sends the musician an invite email with the specific copy we drafted:
//   "You have been added to GigWright. You can log in to see information,
//    gigwright style, or you can opt to just receive information via text
//    and email."
// Fires via Resend directly; reuses the same sender address as magic links.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const musician = await db.musician.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!musician) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!musician.email) {
    return NextResponse.json(
      { error: "musician has no email on file" },
      { status: 400 },
    );
  }

  // Land freshly-invited musicians on /my-profile, where they set payment
  // method, payment address, SMS opt-in, AND now their per-gig guest
  // lists. /my-gigs is one click away from the nav and is the right page
  // for returning visits, but the invite email's whole pitch is "log in
  // and tell us your preferences" — so the first page after sign-in
  // should be the preferences page, not the gig list.
  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";
  const signInUrl = `${baseUrl}/signin?callbackUrl=${encodeURIComponent(
    "/my-profile",
  )}`;

  const apiKey = process.env.AUTH_RESEND_KEY;
  const fallbackFrom = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  // Match the deliverability pattern used by the gig-fanout sender so
  // invites land in inbox, not spam. Two specific moves:
  //
  //  1) From header is "Patrick Lamb via GigWright" <gigs@gigwright.com>
  //     instead of bare gigs@gigwright.com. Mailbox providers (Gmail in
  //     particular) treat brand-only senders more harshly than person-
  //     attributed ones, and our magic-link mail uses the same domain
  //     but lands in inbox — the personable display name is the diff.
  //
  //  2) Reply-To is the bandleader's actual email so musicians can hit
  //     reply and reach a human directly. Reply-To matching a real
  //     person also nudges Gmail toward "transactional / personal"
  //     rather than "bulk marketing" classification.
  //
  // Subject also drops the "just added you" preamble — it scanned as
  // promotional. The new subject is closer to a personal note from the
  // bandleader, which is how this email actually reads.
  const baseName = (user.name ?? user.email).replace(/"/g, '\\"');
  const fromName = `${baseName} via GigWright`;
  const from = `"${fromName}" <${fallbackFrom}>`;
  const replyTo = user.email ?? undefined;

  const html = inviteHtml({
    musicianName: musician.name,
    bandleaderName: user.name ?? user.email,
    signInUrl,
  });
  const text = inviteText({
    musicianName: musician.name,
    bandleaderName: user.name ?? user.email,
    signInUrl,
  });

  // Log every invite attempt to Netlify Function logs so we can debug
  // delivery problems later. Keep PII to a minimum — log the musician id +
  // the masked email + the bandleader's userId.
  const maskedEmail = maskEmail(musician.email);
  console.log(
    `[invite] attempt musicianId=${id} to=${maskedEmail} from=${fallbackFrom} bandleader=${user.id}`,
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: musician.email,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `${baseName} added you to GigWright — log in to set your payout`,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[invite] FAILED status=${res.status} to=${maskedEmail} body=${errText}`,
    );
    return NextResponse.json(
      { error: `Resend ${res.status}: ${errText}` },
      { status: 502 },
    );
  }

  // Resend returns { id: "abc-123" } on success — capture it so we can
  // cross-reference in their dashboard if delivery problems pop up.
  const okJson = (await res.json().catch(() => ({}))) as { id?: string };
  console.log(
    `[invite] sent musicianId=${id} to=${maskedEmail} resendId=${okJson.id ?? "unknown"}`,
  );

  await db.musician.update({
    where: { id },
    data: { invitedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    sentTo: musician.email,
    resendId: okJson.id ?? null,
  });
}

// Mask the local-part of an email so logs don't dump full inboxes.
// "alice.smith@example.com" → "al***@example.com"
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return local.slice(0, 2) + "***" + domain;
}

function inviteText(opts: {
  musicianName: string;
  bandleaderName: string;
  signInUrl: string;
}) {
  const firstName = opts.musicianName.split(" ")[0];
  const bl = opts.bandleaderName;
  return `Hi ${firstName},

${bl} uses GigWright to organize gigs and send the band call sheets. You're now on their roster, which means two things:

  • You'll start getting gig updates by email (and text, once that goes live) — venue, times, attire, set list, the works.
  • Please log in and tell ${bl} how you want to be paid — Cash App, Venmo, Zelle, PayPal, Check, or however else — plus the handle / address that goes with it. Once it's on your profile, payments don't get stuck waiting on you to text back a handle on gig night.

Log in here (no password — just a one-time sign-in link emailed to this address):
${opts.signInUrl}

While you're in there you can also update your phone, email, photo, and roles, and see every gig ${bl} has put you on with full sheets and maps. Logging in is free for you — GigWright is something ${bl} pays for, not you.

If you'd rather skip the login, you can ignore this and you'll still receive gig updates by email (and text, once it's live) — but the payment method really helps everyone, so please do it when you get a minute.

— Sent on behalf of ${bl} via GigWright
`;
}

function inviteHtml(opts: {
  musicianName: string;
  bandleaderName: string;
  signInUrl: string;
}) {
  const firstName = opts.musicianName.split(" ")[0];
  const bl = opts.bandleaderName;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;padding-bottom:16px;border-bottom:1px solid #E5E2D8;">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <p style="font-size:15px;color:#111;margin:20px 0 8px;">Hi ${firstName},</p>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.02em;line-height:1.25;margin:0 0 16px;color:#111;">
        ${escapeHtml(bl)} just added you to GigWright.
      </h1>
      <p style="color:#494336;font-size:14.5px;line-height:1.6;margin:0 0 14px;">
        ${escapeHtml(bl)} uses GigWright to organize gigs and send the band call sheets. You&rsquo;re now on their roster, which means two things:
      </p>
      <ul style="color:#494336;font-size:14px;line-height:1.65;margin:0 0 22px;padding-left:20px;">
        <li style="margin-bottom:10px;">
          <strong style="color:#111;">You&rsquo;ll start getting gig updates by email</strong> (and text, once that goes live) &mdash; venue, times, attire, set list, the works.
        </li>
        <li>
          <strong style="color:#111;">Please log in and tell ${escapeHtml(bl)} how you want to be paid</strong> &mdash; Cash App, Venmo, Zelle, PayPal, Check, or however else &mdash; plus the handle or address that goes with it. Once it&rsquo;s on your profile, payments don&rsquo;t get stuck waiting on you to text back a handle on gig night.
        </li>
      </ul>

      <a href="${opts.signInUrl}" style="display:inline-block;padding:13px 22px;background:#7E2418;color:#FBFAF6;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;letter-spacing:0.01em;">
        Log in to set your payment method →
      </a>

      <p style="color:#857F72;font-size:12px;line-height:1.55;margin:22px 0 0;">
        No password to remember &mdash; just click above and you&rsquo;ll get a one-time sign-in link emailed to this address. While you&rsquo;re in there you can also update your phone, email, photo, and roles, and see every gig ${escapeHtml(bl)} has put you on with full sheets and maps. Logging in is free for you &mdash; GigWright is something ${escapeHtml(bl)} pays for, not you.
      </p>

      <p style="color:#857F72;font-size:12px;line-height:1.55;margin:18px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;">
        Prefer to skip the login? You&rsquo;ll still receive gig updates by email (and text once it&rsquo;s live), but the payment method really helps everyone &mdash; please do it when you get a minute. Sent on behalf of <strong>${escapeHtml(bl)}</strong>.
      </p>
    </div>
  </body>
</html>`;
}

// Tiny HTML escaper so a bandleader's name with special chars (& < > ") can't
// break the markup or open an injection vector.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

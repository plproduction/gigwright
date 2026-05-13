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

  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";
  const signInUrl = `${baseUrl}/signin?callbackUrl=${encodeURIComponent(
    "/my-gigs",
  )}`;

  const apiKey = process.env.AUTH_RESEND_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: musician.email,
      subject: `${user.name ?? "Your bandleader"} just added you to GigWright`,
      html,
      text,
    }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Resend: ${res.status} ${await res.text()}` },
      { status: 502 },
    );
  }

  await db.musician.update({
    where: { id },
    data: { invitedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

function inviteText(opts: {
  musicianName: string;
  bandleaderName: string;
  signInUrl: string;
}) {
  const firstName = opts.musicianName.split(" ")[0];
  const bl = opts.bandleaderName;
  return `Hi ${firstName},

${bl} uses GigWright to organize gigs and send the band call sheets. You're now on their roster, which means a couple of things:

  • You'll start getting gig updates by email (and text, once that goes live) — venue, times, attire, set list, the works.
  • You can also log in to see your own gig calendar and update your own contact info so ${bl} doesn't have to chase you for it.

Once you're logged in you can:

  • Update your phone, email, photo, and roles
  • Set how you're paid (Venmo / Zelle / Cash / etc.) and your payout handle, so payments don't get stuck
  • See every gig ${bl} has put you on, with full sheets and maps

Logging in is free for you — GigWright is something ${bl} pays for, not you. No password to remember — just click the link below and you'll get a one-time sign-in link emailed to this address.

Log in here:
${opts.signInUrl}

If you'd rather skip the login and just receive gig updates via email/text, you can ignore this — that works too.

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
        ${escapeHtml(bl)} uses GigWright to organize gigs and send the band call sheets. You&rsquo;re now on their roster, which means a couple of things:
      </p>
      <ul style="color:#494336;font-size:14px;line-height:1.6;margin:0 0 22px;padding-left:20px;">
        <li style="margin-bottom:6px;">
          <strong style="color:#111;">You&rsquo;ll start getting gig updates by email</strong> (and text, once that goes live) &mdash; venue, times, attire, set list, the works.
        </li>
        <li>
          <strong style="color:#111;">You can also log in</strong> to see your own gig calendar and update your own contact info so ${escapeHtml(bl)} doesn&rsquo;t have to chase you for it.
        </li>
      </ul>

      <p style="color:#111;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">
        Once you&rsquo;re logged in you can
      </p>
      <ul style="color:#494336;font-size:14px;line-height:1.6;margin:0 0 24px;padding-left:20px;">
        <li style="margin-bottom:4px;">Update your phone, email, photo, and roles</li>
        <li style="margin-bottom:4px;">Set how you&rsquo;re paid (Venmo / Zelle / Cash / etc.) and your payout handle, so payments don&rsquo;t get stuck</li>
        <li>See every gig ${escapeHtml(bl)} has put you on, with full sheets and maps</li>
      </ul>

      <p style="color:#494336;font-size:13.5px;line-height:1.6;margin:0 0 22px;">
        Logging in is <strong style="color:#111;">free for you</strong> &mdash; GigWright is something ${escapeHtml(bl)} pays for, not you. No password to remember &mdash; just click below and you&rsquo;ll get a one-time sign-in link emailed to this address.
      </p>

      <a href="${opts.signInUrl}" style="display:inline-block;padding:13px 22px;background:#7E2418;color:#FBFAF6;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;letter-spacing:0.01em;">
        Log in to GigWright →
      </a>

      <p style="color:#857F72;font-size:12px;line-height:1.55;margin:28px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;">
        Prefer to skip the login? You can ignore this and you&rsquo;ll still receive gig updates by email (and text once it&rsquo;s live). Sent on behalf of <strong>${escapeHtml(bl)}</strong>.
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

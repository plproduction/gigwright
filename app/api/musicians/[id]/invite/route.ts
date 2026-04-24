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
      subject: "You've been added to GigWright",
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
  return `Hi ${opts.musicianName.split(" ")[0]},

You have been added to GigWright. You can log in to see information, gigwright style, or you can opt to just receive information via text and email.

Log in here (no password, just a one-time link):
${opts.signInUrl}

— ${opts.bandleaderName} via GigWright
`;
}

function inviteHtml(opts: {
  musicianName: string;
  bandleaderName: string;
  signInUrl: string;
}) {
  const firstName = opts.musicianName.split(" ")[0];
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;padding-bottom:16px;border-bottom:1px solid #E5E2D8;">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <p style="font-size:15px;color:#111;margin:20px 0 8px;">Hi ${firstName},</p>
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:-0.02em;line-height:1.25;margin:0 0 16px;color:#111;">
        You have been added to GigWright.
      </h1>
      <p style="color:#494336;font-size:14px;line-height:1.55;margin:0 0 20px;">
        You can log in to see information, gigwright style, or you can opt to just receive information via text and email.
      </p>
      <a href="${opts.signInUrl}" style="display:inline-block;padding:12px 20px;background:#7E2418;color:#FBFAF6;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
        Log in to GigWright
      </a>
      <p style="color:#857F72;font-size:12px;line-height:1.5;margin:28px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;">
        No password required &mdash; you&rsquo;ll get a one-time sign-in link emailed to this address.
        Sent on behalf of <strong>${opts.bandleaderName}</strong>.
      </p>
    </div>
  </body>
</html>`;
}

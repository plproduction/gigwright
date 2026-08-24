import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

// Receives Resend webhook events (email.opened, email.clicked,
// email.bounced, email.complained, etc.) and updates the matching
// GigPersonnel row so the Payout Worksheet can show delivery status
// chips alongside the Accept/Decline response state.
//
// Setup for this route to actually receive events:
//   1. In Resend dashboard → Webhooks → Add endpoint:
//        URL: https://gigwright.com/api/resend/webhook
//        Events: email.opened, email.clicked
//        (email.bounced + email.complained also useful — Resend
//        docs list all types)
//   2. Copy the signing secret from that endpoint's detail page.
//   3. In Netlify env vars: add RESEND_WEBHOOK_SECRET with that
//      whsec_... value.
//   4. Enable open + click tracking under Resend's account settings
//      (Settings → Emails → Click tracking / Open tracking → ON).
//      Without these enabled the events never fire.
//
// Until RESEND_WEBHOOK_SECRET is set, we still handle events but skip
// signature verification (with a warning log). Ships in a partially
// wired state gracefully; Patrick can turn the crank without
// breaking anything.

export const dynamic = "force-dynamic";

type ResendEvent = {
  type: string;
  data?: {
    email_id?: string;
    created_at?: string;
    // Individual event types carry extra fields (click.url,
    // bounce.type, etc.) — we ignore them for now.
  };
};

export async function POST(req: Request) {
  const body = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("svix-signature");
    const msgId = req.headers.get("svix-id");
    const ts = req.headers.get("svix-timestamp");
    if (!sig || !msgId || !ts) {
      return NextResponse.json(
        { error: "missing svix headers" },
        { status: 400 },
      );
    }
    // Resend uses Svix under the hood; signature format is
    // "v1,<base64_hmac>". We compute HMAC-SHA256 over
    // "<msgId>.<ts>.<body>" and compare (constant-time) against the
    // last comma-separated portion of the header.
    const signedContent = `${msgId}.${ts}.${body}`;
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");
    const provided = sig
      .split(" ")
      .map((s) => s.split(",")[1])
      .filter(Boolean);
    const match = provided.some((p) => {
      const a = Buffer.from(p);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!match) {
      console.warn(`[resend-webhook] signature mismatch`);
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  } else {
    console.warn(
      `[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting event without verification`,
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    // Some events (e.g., contact.created) don't carry email_id;
    // acknowledge and move on so Resend doesn't retry.
    return NextResponse.json({ received: true });
  }

  // Look up the personnel row we sent this email to. If we don't
  // find one, it was probably a different email flow (roster invite,
  // magic link) — just acknowledge and move on.
  const personnel = await db.gigPersonnel.findUnique({
    where: { resendEmailId: emailId },
    select: { id: true, gigId: true, emailOpenedAt: true, emailClickedAt: true },
  });
  if (!personnel) {
    return NextResponse.json({ received: true });
  }

  const eventAt = event.data?.created_at
    ? new Date(event.data.created_at)
    : new Date();

  switch (event.type) {
    case "email.opened": {
      // First open only — subsequent opens don't move the timestamp.
      // A prior send's opens should already be cleared (sendGigInvite
      // wipes emailOpenedAt on resend).
      if (!personnel.emailOpenedAt) {
        await db.gigPersonnel.update({
          where: { id: personnel.id },
          data: { emailOpenedAt: eventAt },
        });
      }
      break;
    }
    case "email.clicked": {
      // First click only. If they clicked without an open recorded
      // (some clients suppress opens but track clicks), backfill the
      // open timestamp too so the chip reads correctly.
      const patch: {
        emailClickedAt?: Date;
        emailOpenedAt?: Date;
      } = {};
      if (!personnel.emailClickedAt) patch.emailClickedAt = eventAt;
      if (!personnel.emailOpenedAt) patch.emailOpenedAt = eventAt;
      if (Object.keys(patch).length > 0) {
        await db.gigPersonnel.update({
          where: { id: personnel.id },
          data: patch,
        });
      }
      break;
    }
    // Ignore other event types for now (bounced, complained, delivered
    // etc.) — could surface them later if useful.
  }

  return NextResponse.json({ received: true });
}

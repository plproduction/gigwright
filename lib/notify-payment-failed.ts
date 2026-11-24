// Transactional email sent the first time a subscriber's renewal payment
// fails (Stripe `invoice.payment_failed`). Stripe keeps retrying the charge
// automatically for about a week, but a lapsed card otherwise sits silent
// until the customer happens to log back in and see the billing-page nudge
// (app/(app)/settings/billing/page.tsx). This closes that gap: one email,
// sent once per dunning cycle (see the caller in
// app/api/stripe/webhook/route.ts), pointing straight at the Customer
// Portal so the customer can update or swap their card themselves.
//
// Deliberately NOT asking the customer to reply with a card number —
// that's the Customer Portal's job, over Stripe's own secure form.

import { bareEmail } from "@/lib/email-render";

type Args = {
  to: string;
  name: string | null;
  amount: number; // dollars, e.g. 20
};

export async function sendPaymentFailedEmail(
  args: Args,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Email sending not configured (missing AUTH_RESEND_KEY).",
    };
  }

  const fromAddr = bareEmail(process.env.EMAIL_FROM ?? "gigs@gigwright.com");
  const from = `"GigWright Billing" <${fromAddr}>`;
  const firstName = args.name?.trim().split(/\s+/)[0] || "there";
  const origin = process.env.AUTH_URL ?? "https://gigwright.com";
  const portalUrl = `${origin}/settings/billing`;
  const amountStr = args.amount.toFixed(2);
  const subject = "Your GigWright payment didn't go through";

  const text = [
    `Hi ${firstName},`,
    ``,
    `Your latest GigWright subscription payment ($${amountStr}) didn't go through.`,
    ``,
    `Stripe will keep retrying automatically for about a week, but you don't have to wait on that. Update or swap in a new card here:`,
    ``,
    portalUrl,
    ``,
    `No need to reply to this email with any card details — that link takes you straight to a secure Stripe page where you can update your payment method yourself.`,
    ``,
    `— GigWright`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.02em;padding-bottom:14px;border-bottom:1px solid #E5E2D8;color:#111">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.02em;line-height:1.2;margin:20px 0 6px;color:#111">
        Your payment didn&rsquo;t go through
      </h1>
      <p style="font-size:14px;color:#494336;line-height:1.55;margin:16px 0 0">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="font-size:14px;color:#494336;line-height:1.55;margin:12px 0 0">
        Your latest GigWright subscription payment
        (<strong>$${escapeHtml(amountStr)}</strong>) didn&rsquo;t go through.
      </p>
      <p style="font-size:14px;color:#494336;line-height:1.55;margin:12px 0 0">
        Stripe will keep retrying automatically for about a week, but you
        don&rsquo;t have to wait on that &mdash; you can update or swap in a
        new card right now.
      </p>
      <p style="margin:24px 0 8px">
        <a href="${portalUrl}" style="display:inline-block;background:#7E2418;color:#FBFAF6;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          Update payment method
        </a>
      </p>
      <p style="font-size:13px;color:#494336;line-height:1.55;margin:16px 0 0">
        That link takes you to a secure Stripe page where you can update
        your card yourself. No need to reply to this email with any card
        details.
      </p>
      <p style="font-size:12px;color:#857F72;line-height:1.5;margin:24px 0 0;padding-top:16px;border-top:1px solid #E5E2D8">
        Sent by GigWright.
      </p>
    </div>
  </body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[payment-failed-email] FAILED status=${res.status} to=${maskEmail(args.to)} body=${errText}`,
      );
      return { ok: false, error: `Resend ${res.status}: ${errText}` };
    }
    const okJson = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(
      `[payment-failed-email] sent to=${maskEmail(args.to)} resendId=${okJson.id ?? "unknown"}`,
    );
    return { ok: true, id: okJson.id ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[payment-failed-email] threw to=${maskEmail(args.to)} err=${msg}`,
    );
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  return email.slice(0, 2) + "***" + email.slice(at);
}

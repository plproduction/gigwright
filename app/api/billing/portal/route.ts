import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

// POST /api/billing/portal → sends the user to Stripe's Customer Portal to
// cancel, upgrade, or update their payment method. Stripe handles everything
// there; we just start the session.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "no stripe customer" },
      { status: 400 },
    );
  }
  const origin =
    req.headers.get("origin") ??
    process.env.AUTH_URL ??
    "https://gigwright.com";

  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });
  return NextResponse.redirect(session.url, { status: 303 });
}

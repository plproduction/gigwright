import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { stripe, STRIPE_PRICE_ID, TRIAL_DAYS } from "@/lib/stripe";

// POST /api/billing/checkout → creates a Stripe Checkout session for Pro and
// redirects the user to Stripe's hosted checkout. On success, Stripe sends
// them back to /settings/billing?checkout=success and fires a webhook to
// /api/stripe/webhook which flips the user's plan to PRO.
export async function POST(req: Request) {
  const user = await requireUser();

  if (!STRIPE_PRICE_ID) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_ID not configured" },
      { status: 500 },
    );
  }

  const origin =
    req.headers.get("origin") ??
    process.env.AUTH_URL ??
    "https://gigwright.vercel.app";

  // Upsert the Stripe Customer so the subscription is attached to a stable id
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { gigwrightUserId: user.id },
    });
    customerId = customer.id;
    await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { gigwrightUserId: user.id },
    },
    success_url: `${origin}/settings/billing?checkout=success`,
    cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}

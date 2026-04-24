import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { stripe, resolvePriceId, TRIAL_DAYS } from "@/lib/stripe";

// POST /api/billing/checkout → creates a Stripe Checkout session for Pro and
// redirects the user to Stripe's hosted checkout. On success, Stripe sends
// them back to /settings/billing?checkout=success and fires a webhook to
// /api/stripe/webhook which flips the user's plan to PRO.
//
// Body / form: { plan?: "month" | "year" }. Defaults to monthly.
// Accepts either JSON body or application/x-www-form-urlencoded (so the
// /welcome page can post a plain <form>).
export async function POST(req: Request) {
  const user = await requireUser();

  // Accept plan from form, JSON body, or querystring.
  const url = new URL(req.url);
  let plan: string | null = url.searchParams.get("plan");
  if (!plan) {
    const ct = req.headers.get("content-type") ?? "";
    try {
      if (ct.includes("application/json")) {
        const body = (await req.json()) as { plan?: string };
        plan = body.plan ?? null;
      } else if (
        ct.includes("application/x-www-form-urlencoded") ||
        ct.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        plan = form.get("plan")?.toString() ?? null;
      }
    } catch {
      /* no body — fine, default to monthly */
    }
  }

  const priceId = resolvePriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "Stripe price not configured. Set STRIPE_PRICE_ID_MONTHLY (and optionally STRIPE_PRICE_ID_YEARLY).",
      },
      { status: 500 },
    );
  }

  const origin =
    req.headers.get("origin") ??
    process.env.AUTH_URL ??
    "https://gigwright.com";

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
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { gigwrightUserId: user.id, plan: plan ?? "month" },
    },
    success_url: `${origin}/settings/billing?checkout=success`,
    cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}

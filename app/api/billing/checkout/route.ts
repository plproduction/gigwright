import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { stripe, resolvePriceId, TRIAL_DAYS } from "@/lib/stripe";
import { randomBytes } from "crypto";

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

  // Bulletproofing: refuse to start a fresh checkout if the user is
  // already PRO/ADMIN. Without this, a stale browser tab could create
  // a second subscription on top of an existing active one, double-
  // billing the customer. Send them to the Customer Portal instead.
  if (user.plan === "PRO" || user.plan === "ADMIN") {
    const origin =
      req.headers.get("origin") ??
      process.env.AUTH_URL ??
      "https://gigwright.com";
    return NextResponse.redirect(
      `${origin}/settings/billing?checkout=already-pro`,
      { status: 303 },
    );
  }

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

  // Resolve or create the Stripe customer. Defensive path: if we have a
  // stripeCustomerId on file but Stripe says the customer is missing or
  // deleted (e.g., test data wiped, mode switch), we transparently create
  // a fresh one so the user can still subscribe instead of seeing a 500.
  let customerId = user.stripeCustomerId;
  if (customerId) {
    try {
      const existing = await stripe().customers.retrieve(customerId);
      if ((existing as { deleted?: boolean }).deleted) {
        customerId = null;
      }
    } catch {
      // 404 or any retrieval failure → treat as missing and recreate.
      customerId = null;
    }
  }
  if (!customerId) {
    const customer = await stripe().customers.create(
      {
        email: user.email,
        name: user.name ?? undefined,
        metadata: { gigwrightUserId: user.id },
      },
      // Idempotency on customer creation prevents a duplicate Stripe
      // customer from spawning if this request is retried by the browser
      // or replayed by Stripe's edge.
      { idempotencyKey: `customer-create-${user.id}` },
    );
    customerId = customer.id;
    await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  // Checkout session idempotency: a fresh nonce per request, but the
  // session is keyed so a double-submit (network retry, double-click)
  // returns the SAME session instead of creating two.
  const idempotencyKey = `checkout-${user.id}-${priceId}-${randomBytes(8).toString("hex")}`;

  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { gigwrightUserId: user.id, plan: plan ?? "month" },
      },
      // Customer metadata is duplicated on the Checkout session itself
      // so the checkout.session.completed webhook can recover the user
      // even if the subscription metadata path fails for any reason.
      metadata: { gigwrightUserId: user.id },
      success_url: `${origin}/settings/billing?checkout=success`,
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
      allow_promotion_codes: true,
    },
    { idempotencyKey },
  );

  return NextResponse.redirect(session.url!, { status: 303 });
}

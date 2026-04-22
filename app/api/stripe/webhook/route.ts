import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { db } from "@/lib/db";

// Stripe webhook receiver. Listens for subscription lifecycle events and
// keeps the User.plan / stripeSubscriptionId / currentPeriodEnd in sync.
//
// Events handled:
//   - checkout.session.completed        → first successful checkout
//   - customer.subscription.created     → subscription exists (incl. trial)
//   - customer.subscription.updated     → plan, status, period end changes
//   - customer.subscription.deleted     → cancellation → drop to FREE
//   - invoice.paid                      → confirms paid status
//   - invoice.payment_failed            → optional: flag for UI nudge
export async function POST(req: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return NextResponse.json(
      { error: `invalid signature: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        (session.metadata?.gigwrightUserId as string | undefined) ??
        (session.subscription && typeof session.subscription === "string"
          ? await findUserBySubscription(session.subscription)
          : null);
      if (userId && typeof session.subscription === "string") {
        await applySubscription(userId, session.subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId =
        (sub.metadata?.gigwrightUserId as string | undefined) ??
        (await findUserByCustomer(
          typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        ));
      if (userId) await applySubscriptionFromObject(userId, sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await findUserByCustomer(
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      );
      if (userId) {
        await db.user.update({
          where: { id: userId },
          data: {
            plan: "FREE",
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
          },
        });
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
      // Intentionally no-op for MVP — subscription events carry the state
      // we care about. Payment-failure nudges can live here later.
      break;
  }

  return NextResponse.json({ received: true });
}

async function findUserByCustomer(customerId: string) {
  const u = await db.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return u?.id ?? null;
}

async function findUserBySubscription(subId: string) {
  const u = await db.user.findFirst({
    where: { stripeSubscriptionId: subId },
    select: { id: true },
  });
  return u?.id ?? null;
}

async function applySubscription(userId: string, subscriptionId: string) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  await applySubscriptionFromObject(userId, sub);
}

async function applySubscriptionFromObject(
  userId: string,
  sub: Stripe.Subscription,
) {
  // A subscription counts as "paid" in ACTIVE or TRIALING status. PAST_DUE
  // still keeps PRO for a grace period; anything else drops to FREE.
  const paidStates: Stripe.Subscription.Status[] = [
    "active",
    "trialing",
    "past_due",
  ];
  const plan = paidStates.includes(sub.status) ? "PRO" : "FREE";
  // In recent Stripe API versions, current_period_end lives on each item.
  // For a single-price subscription, first item's period end is the renewal.
  const item = sub.items?.data?.[0];
  const epoch =
    (item as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end;
  const currentPeriodEnd =
    typeof epoch === "number" ? new Date(epoch * 1000) : null;

  await db.user.update({
    where: { id: userId },
    data: {
      plan,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd,
    },
  });
}

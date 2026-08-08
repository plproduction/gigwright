import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { db } from "@/lib/db";
import { recalcForReferredUser } from "@/lib/actions/referrals";

// Stripe webhook receiver. Listens for subscription lifecycle events and
// keeps the User.plan / stripeSubscriptionId / currentPeriodEnd in sync.
//
// Events handled:
//   - checkout.session.completed             → first successful checkout
//   - customer.subscription.created          → subscription exists (incl. trial)
//   - customer.subscription.updated          → plan, status, period end changes
//   - customer.subscription.deleted          → cancellation → drop to FREE
//   - customer.subscription.trial_will_end   → fires 3 days before charge,
//                                              used to surface a "card on
//                                              file?" nudge in the UI
//   - invoice.paid                           → confirms paid status (no-op;
//                                              subscription events carry it)
//   - invoice.payment_failed                 → renewal card declined; flag
//                                              the user record so billing
//                                              page can show a nudge
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
      } else if (!userId) {
        // Stripe sent a checkout.completed that we can't attribute to a
        // GigWright user. Logged so it's discoverable in Netlify logs
        // — usually a sign of a manually-created subscription in Stripe
        // or a metadata mismatch.
        console.warn(
          `[stripe webhook] checkout.session.completed without matching user: session=${session.id} customer=${typeof session.customer === "string" ? session.customer : session.customer?.id}`,
        );
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
            paymentFailedAt: null,
            trialEndingAt: null,
            cancelAtPeriodEnd: false,
          },
        });
        // Cancellation may drop this user's referrer below the 3-paid
        // threshold — recalc so the referrer's comp gets removed on
        // their next billing cycle.
        await recalcForReferredUser(userId);
      }
      break;
    }
    case "customer.subscription.trial_will_end": {
      // Fires ~3 days before the trial ends. We surface this on the
      // billing page so users get a nudge to confirm payment before
      // the first charge instead of getting a payment-failed email
      // a few days later.
      const sub = event.data.object as Stripe.Subscription;
      const userId = await findUserByCustomer(
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      );
      if (userId) {
        await db.user.update({
          where: { id: userId },
          data: { trialEndingAt: new Date() },
        });
      }
      break;
    }
    case "invoice.paid": {
      // A successful invoice clears both warning flags. We don't try
      // to confirm plan state here — subscription.updated arrives in
      // the same delivery and carries the authoritative status.
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string"
          ? inv.customer
          : inv.customer?.id ?? null;
      if (customerId) {
        const userId = await findUserByCustomer(customerId);
        if (userId) {
          await db.user.update({
            where: { id: userId },
            data: { paymentFailedAt: null, trialEndingAt: null },
          });
          // First paid invoice makes this user "paid" for referral
          // counting purposes; every subsequent paid invoice is a
          // confirmation that they're still active. Either way, this
          // is the moment their referrer's comp threshold may cross.
          await recalcForReferredUser(userId);
        }
      }
      break;
    }
    case "invoice.payment_failed": {
      // Renewal card declined. We don't immediately downgrade —
      // Stripe gives the customer a grace period and will retry. We
      // just flag the user so the billing page can render the nudge.
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string"
          ? inv.customer
          : inv.customer?.id ?? null;
      if (customerId) {
        const userId = await findUserByCustomer(customerId);
        if (userId) {
          await db.user.update({
            where: { id: userId },
            data: { paymentFailedAt: new Date() },
          });
          // Payment failure disqualifies this user from counting
          // toward their referrer's comp (countPaidReferrals filters
          // out paymentFailedAt != null). Recalc so the referrer's
          // comp reflects the shortfall on next billing cycle.
          await recalcForReferredUser(userId);
        }
      }
      break;
    }
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
      // Mirror Stripe's cancel_at_period_end so the UI can render
      // "Cancelled — Pro until [date]" without re-querying Stripe.
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    },
  });
}

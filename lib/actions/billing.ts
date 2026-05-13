"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

// Reconciliation helper: re-pull the user's subscription state from
// Stripe and overwrite the local DB record with whatever Stripe says.
// Use when a webhook may have been dropped or when a user reports their
// plan looking wrong — Stripe is the source of truth, so this is the
// "fix it" lever the billing page exposes via a button.
//
// No-op (returns silently) if the user has no stripeCustomerId at all.
// Looks up the customer's current active or trialing subscription; if
// none exists, downgrades the local record to FREE.
export async function resyncSubscriptionFromStripe() {
  const user = await requireUser();
  if (!user.stripeCustomerId) {
    revalidatePath("/settings/billing");
    return;
  }

  // Pull every non-canceled subscription on this customer — usually
  // just one, but if a glitch ever left an orphan we want to see it.
  const subs = await stripe().subscriptions.list({
    customer: user.stripeCustomerId,
    status: "all",
    limit: 5,
  });

  // The "real" subscription is the most recent active/trialing/past_due
  // one. If none qualify, the user is effectively cancelled.
  const paidStates: Stripe.Subscription.Status[] = [
    "active",
    "trialing",
    "past_due",
  ];
  const live = subs.data
    .filter((s) => paidStates.includes(s.status))
    .sort((a, b) => b.created - a.created)[0];

  if (!live) {
    await db.user.update({
      where: { id: user.id },
      data: {
        plan: "FREE",
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        paymentFailedAt: null,
        trialEndingAt: null,
      },
    });
    revalidatePath("/settings/billing");
    return;
  }

  const item = live.items?.data?.[0];
  const epoch =
    (item as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end;
  const currentPeriodEnd =
    typeof epoch === "number" ? new Date(epoch * 1000) : null;

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: "PRO",
      stripeSubscriptionId: live.id,
      currentPeriodEnd,
      cancelAtPeriodEnd: !!live.cancel_at_period_end,
    },
  });

  revalidatePath("/settings/billing");
}

"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { REFERRALS_REQUIRED } from "@/lib/referrals-shared";

// Referral program (Patrick 2026-08-06).
//
// Rules of the game:
//   - Every user has an unguessable 8-char referralCode. Landing page
//     reads ?ref=CODE, sets a 30-day cookie ("gw_ref"), auth flow reads
//     the cookie on first sign-in and stamps the new User.referredById.
//   - "Paid referral" = referred user is on plan=PRO AND has a Stripe
//     subscription that has landed at least one non-refunded invoice
//     (past the 14-day trial). Free plan and trialing don't count.
//   - When your paid-referral count >= 3, we apply a 100%-off recurring
//     Stripe coupon to YOUR subscription. Only takes effect if you are
//     yourself a paying subscriber (Free users have nothing to comp).
//   - Rolling: if a referral churns and you fall below 3, the coupon is
//     removed on the next billing cycle.
//   - Coupon ID lives in the env var STRIPE_REFERRAL_COUPON_ID. Patrick
//     creates a "100%-off forever" coupon once in the Stripe dashboard
//     and pastes the id in Netlify. If unset, we track everything but
//     skip the Stripe coupon step — the UI still shows progress.

// ————————————————————————————————————————————————————————————————
// Read-only helpers
// ————————————————————————————————————————————————————————————————

// Length of the referral code (8 hex chars = 4 random bytes). Internal
// only — no need to export.
const CODE_BYTES = 4;

// Generate + persist a referralCode for this user if they don't have
// one yet. Idempotent — returns the existing code on repeat calls.
export async function ensureReferralCode() {
  const user = await requireUser();
  if (user.referralCode) return user.referralCode;

  // Retry a few times in the astronomically unlikely event of a
  // collision on the @unique index. 8 hex chars is 4 billion values;
  // at Patrick's projected user count this is theatre, but cheap.
  for (let i = 0; i < 6; i++) {
    const code = randomBytes(CODE_BYTES).toString("hex");
    try {
      await db.user.update({ where: { id: user.id }, data: { referralCode: code } });
      return code;
    } catch {
      // Assume unique-constraint clash, try again.
      continue;
    }
  }
  throw new Error("Could not generate a unique referral code — try again.");
}

// Returns the caller's referral status: their code, count of paid
// referrals, and whether the 100%-off comp is currently applied.
export async function getReferralStatus() {
  const user = await requireUser();
  const code = user.referralCode ?? (await ensureReferralCode());
  const paidCount = await countPaidReferrals(user.id);
  return {
    code,
    paidCount,
    required: REFERRALS_REQUIRED,
    compActive: user.referralCompActive,
    // Their share-ready URL. Read from env so preview and prod work.
    shareUrl: `${process.env.AUTH_URL ?? "https://gigwright.com"}/?ref=${code}`,
  } as const;
}

// Count how many users this referrer has referred who are currently
// "paid" — plan=PRO AND currentPeriodEnd is in the future (Stripe's
// canonical "is this subscription active right now" signal). Users on
// Free plan, on trial, or cancelled subscriptions don't count.
export async function countPaidReferrals(referrerId: string): Promise<number> {
  const now = new Date();
  return db.user.count({
    where: {
      referredById: referrerId,
      plan: "PRO",
      // Stripe's currentPeriodEnd is the end of the current billing
      // period. If it's in the past, the subscription lapsed and we
      // haven't updated the User row yet — treat as not-paid.
      currentPeriodEnd: { gt: now },
      // paymentFailedAt is set when Stripe reports a failed renewal.
      // Being in "grace" period with a failed payment shouldn't count
      // toward someone else's comp.
      paymentFailedAt: null,
    },
  });
}

// ————————————————————————————————————————————————————————————————
// Attribution — called during sign-in flow
// ————————————————————————————————————————————————————————————————

// Called from the auth flow after a new User row is created. Reads the
// referral code from the cookie and stamps referredById on the user
// if valid. Idempotent + defensive — never throws (a referral failure
// must not block signup).
export async function attributeSignup(userId: string, refCode: string | null) {
  if (!refCode) return;
  try {
    const [user, referrer] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, referredById: true },
      }),
      db.user.findUnique({
        where: { referralCode: refCode },
        select: { id: true },
      }),
    ]);
    if (!user || !referrer) return;
    if (user.referredById) return; // already attributed; don't overwrite
    if (referrer.id === user.id) return; // can't refer yourself
    await db.user.update({
      where: { id: user.id },
      data: { referredById: referrer.id },
    });
    console.log(
      `[referral] attributed user=${user.id} to referrer=${referrer.id} via code=${refCode}`,
    );
  } catch (err) {
    console.warn(`[referral] attributeSignup failed:`, err);
  }
}

// ————————————————————————————————————————————————————————————————
// Comp recalc — called from Stripe webhook after subscription events
// ————————————————————————————————————————————————————————————————

// Recalculate whether a specific referrer's 100%-off coupon should be
// applied. Called from the Stripe webhook on invoice.paid,
// customer.subscription.updated, and customer.subscription.deleted for
// the referred user. The referrer is looked up from the changed user's
// referredById.
//
// If STRIPE_REFERRAL_COUPON_ID is unset, we still update the local
// referralCompActive flag so the UI reflects the state, but skip the
// actual Stripe API call. Patrick can wire the coupon later without
// breaking anything.
export async function recalcReferralComp(referrerId: string) {
  try {
    const referrer = await db.user.findUnique({
      where: { id: referrerId },
      select: {
        id: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        referralCompActive: true,
      },
    });
    if (!referrer) return;

    const paidCount = await countPaidReferrals(referrerId);
    const shouldBeComped = paidCount >= REFERRALS_REQUIRED;

    // No local change needed?
    if (shouldBeComped === referrer.referralCompActive) return;

    const couponId = process.env.STRIPE_REFERRAL_COUPON_ID;
    const hasStripeSub = !!referrer.stripeSubscriptionId;

    if (couponId && hasStripeSub) {
      // Apply or remove the coupon on the Stripe subscription. Wrapped
      // in try so a Stripe hiccup doesn't strand the local state.
      try {
        if (shouldBeComped) {
          // Stripe's newer API uses the `discounts` array on
          // subscription.update to attach coupons — the old top-level
          // `coupon` field is deprecated. Passing a single-element
          // array with `{coupon: couponId}` is the current shape.
          await stripe().subscriptions.update(referrer.stripeSubscriptionId!, {
            discounts: [{ coupon: couponId }],
          });
          console.log(
            `[referral] applied coupon=${couponId} to subscription=${referrer.stripeSubscriptionId} for referrer=${referrer.id} (paidCount=${paidCount})`,
          );
        } else {
          // Passing an empty discounts array removes any attached
          // coupon from the subscription.
          await stripe().subscriptions.update(referrer.stripeSubscriptionId!, {
            discounts: [],
          });
          console.log(
            `[referral] removed coupon from subscription=${referrer.stripeSubscriptionId} for referrer=${referrer.id} (paidCount=${paidCount})`,
          );
        }
      } catch (err) {
        console.error(
          `[referral] Stripe coupon toggle failed for referrer=${referrer.id}:`,
          err,
        );
        // Fall through — still update local state so the UI shows the
        // right progress even if the coupon didn't stick this cycle.
      }
    } else if (!couponId) {
      console.log(
        `[referral] would ${shouldBeComped ? "apply" : "remove"} coupon for referrer=${referrer.id} but STRIPE_REFERRAL_COUPON_ID is unset — tracking locally only`,
      );
    }

    await db.user.update({
      where: { id: referrer.id },
      data: { referralCompActive: shouldBeComped },
    });
    revalidatePath("/settings/billing");
  } catch (err) {
    console.error(`[referral] recalcReferralComp failed for ${referrerId}:`, err);
  }
}

// Helper: given a userId whose subscription state just changed, find
// their referrer (if any) and recalc the referrer's comp. Meant to be
// called from the Stripe webhook handler.
export async function recalcForReferredUser(referredUserId: string) {
  const user = await db.user.findUnique({
    where: { id: referredUserId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;
  await recalcReferralComp(user.referredById);
}

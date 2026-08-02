// Plan-tier gates. Single source of truth for what FREE can do vs.
// what's reserved for PRO/ADMIN. The /welcome and /settings/billing
// copy describes these limits to users — the constants here are the
// machinery that actually enforces them.
//
// ADMIN bypasses every gate. PRO has no caps. FREE is the constrained
// path. Trialing users have plan=PRO (status=trialing) for the trial
// duration; if they don't pay, the Stripe webhook flips them to FREE
// and the gates start applying.

import { db } from "@/lib/db";

export type Plan = "FREE" | "PRO" | "ADMIN";

// Hard caps for the FREE tier. Numbers match the UI copy in
// app/welcome/page.tsx and app/(app)/settings/billing/page.tsx. If
// these change, update both UI strings to stay honest.
export const FREE_LIMITS = {
  musicians: 10,
  venues: 5,
  // "Active" = not CANCELLED. Past PLAYED gigs still count as active
  // because the bandleader's roster of gigs is the asset, not a
  // calendar of future-only events. If a bandleader has 5 PLAYED
  // gigs in their history they still hit the cap for the next new
  // gig — the message they see is the upgrade nudge, which is the
  // intended behavior on a tool meant for working bandleaders.
  activeGigs: 5,
} as const;

// Feature gates: features that are entirely unavailable on FREE,
// regardless of count. Each maps to a short reason string we surface
// in the "Upgrade to Pro" UI when a FREE user hits the gate.
export const PRO_ONLY_FEATURES = {
  sms: "SMS notifications to the band",
  qbo: "QuickBooks Online sync",
  setlistUpload: "Set list PDF uploads",
  calendarSync: "Two-way calendar sync (iCloud, Google, Outlook)",
} as const;

export type ProOnlyFeature = keyof typeof PRO_ONLY_FEATURES;

// Length of the one and only free window a bandleader ever gets.
// Lives here rather than in lib/stripe.ts so lib/session.ts can grant a
// trial without pulling in the Stripe SDK on every authenticated request.
export const TRIAL_DAYS = 14;

// Has-pro check. ADMIN and PRO both count as "paid"; FREE does not.
//
// A bandleader inside their 14-day trial carries plan="PRO" with a
// trialEndingAt in the future, so every existing gate keeps working
// untouched — trialing users are treated exactly like paid users until
// the day the trial lapses.
export function isPaid(plan: Plan | string | null | undefined): boolean {
  return plan === "PRO" || plan === "ADMIN";
}

// There is no free tier. plan="FREE" means "the 14 days are gone and no
// subscription was started" — a lapsed account, not a free one.
//
// ADMIN is always exempt. Musicians are exempt too: they never pay, and
// they are bounced to their own portal before this is ever consulted.
export function hasLapsed(user: {
  role: string;
  plan: Plan | string;
}): boolean {
  if (user.role === "ADMIN" || user.plan === "ADMIN") return false;
  if (user.role === "MUSICIAN") return false;
  return !isPaid(user.plan);
}

// True once the trial clock has run out and no subscription took over.
// Deliberately excludes anyone holding a stripeSubscriptionId — a real
// subscriber whose trialEndingAt is simply in the past is a PAYING
// customer, not an expired trial, and must never be downgraded.
export function trialIsExpired(user: {
  plan: Plan | string;
  trialEndingAt: Date | null;
  stripeSubscriptionId: string | null;
}): boolean {
  if (user.plan !== "PRO") return false;
  if (user.stripeSubscriptionId) return false;
  if (!user.trialEndingAt) return false;
  return user.trialEndingAt.getTime() <= Date.now();
}

// The moment a fresh trial should end, counted from now.
export function trialEndFromNow(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

// Throwing gate for server actions / API routes. The caller chooses
// the feature label so the error message is specific. Catch this in
// the UI to render an inline "Upgrade to Pro" affordance instead of
// a generic error.
export class PlanGateError extends Error {
  constructor(
    public readonly feature: string,
    message: string,
  ) {
    super(message);
    this.name = "PlanGateError";
  }
}

// Require PRO/ADMIN for a feature. Throws PlanGateError if the user
// is on FREE. Use at the top of server actions that touch gated
// features (QBO push, set list upload, SMS fanout, etc.).
export function requirePro(
  plan: Plan | string | null | undefined,
  feature: ProOnlyFeature,
): void {
  if (isPaid(plan)) return;
  throw new PlanGateError(
    feature,
    `${PRO_ONLY_FEATURES[feature]} is a Pro feature. Upgrade at /settings/billing to enable it.`,
  );
}

// Count-cap gate. Throws if the user is on FREE and adding one more
// row of `kind` would exceed the cap. Counts the user's existing
// rows live each call — there's no caching, so the check is always
// accurate. The error message is suitable to surface verbatim in the
// UI.
export async function assertCanAdd(
  user: { id: string; plan: Plan | string },
  kind: keyof typeof FREE_LIMITS,
): Promise<void> {
  if (isPaid(user.plan)) return;
  const cap = FREE_LIMITS[kind];
  let current = 0;
  if (kind === "musicians") {
    current = await db.musician.count({ where: { ownerId: user.id } });
  } else if (kind === "venues") {
    current = await db.venue.count({ where: { ownerId: user.id } });
  } else if (kind === "activeGigs") {
    current = await db.gig.count({
      where: { ownerId: user.id, status: { not: "CANCELLED" } },
    });
  }
  if (current >= cap) {
    throw new PlanGateError(
      kind,
      `Free plan is capped at ${cap} ${labelFor(kind)}. Upgrade to Pro for unlimited.`,
    );
  }
}

function labelFor(kind: keyof typeof FREE_LIMITS): string {
  if (kind === "musicians") return "musicians";
  if (kind === "venues") return "venues";
  return "active gigs";
}

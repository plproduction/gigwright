import Stripe from "stripe";

// Lazy singleton so the SDK only instantiates when actually needed (pages
// that don't touch billing won't pay the import cost). Throws with a clear
// message if STRIPE_SECRET_KEY isn't wired up yet.
let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to the environment to enable billing.",
    );
  }
  _stripe = new Stripe(key, {
    // Use the SDK's default API version pinned at build time
    typescript: true,
  });
  return _stripe;
}

// Monthly is also the legacy default if nothing else is configured.
export const STRIPE_PRICE_ID_MONTHLY =
  process.env.STRIPE_PRICE_ID_MONTHLY ??
  process.env.STRIPE_PRICE_ID ?? // back-compat with the single-plan era
  "";
export const STRIPE_PRICE_ID_YEARLY = process.env.STRIPE_PRICE_ID_YEARLY ?? "";
// Legacy export kept so any old imports still compile; prefer the _MONTHLY /
// _YEARLY pair going forward.
export const STRIPE_PRICE_ID = STRIPE_PRICE_ID_MONTHLY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const TRIAL_DAYS = 14;

// Resolve a Stripe price ID from a plan choice coming from the UI
// (monthly vs yearly). Defaults to monthly if input is missing or invalid.
export function resolvePriceId(plan: string | undefined | null): string {
  if (plan === "year" || plan === "yearly" || plan === "annual") {
    return STRIPE_PRICE_ID_YEARLY || STRIPE_PRICE_ID_MONTHLY;
  }
  return STRIPE_PRICE_ID_MONTHLY;
}

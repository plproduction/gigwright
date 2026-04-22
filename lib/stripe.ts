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

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const TRIAL_DAYS = 14;

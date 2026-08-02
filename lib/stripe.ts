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
  // Production sanity check: fail hard if a test-mode secret key was
  // shipped to production. Exact incident this guards against: a real
  // customer (Debbie Pierce, 2026-07-27) hit "Start trial" on the live
  // site and got "Your card was declined... test mode, but used a non
  // test card." Stripe silently rejects every real card when the server
  // is holding an sk_test_... key. Fail loudly at billing init instead
  // of letting the error surface as a card decline the customer blames
  // on their bank.
  if (
    process.env.NODE_ENV === "production" &&
    key.startsWith("sk_test_")
  ) {
    throw new Error(
      "STRIPE_SECRET_KEY is a TEST-mode key (sk_test_...) but NODE_ENV is production. " +
        "Real credit cards will be silently rejected. Update the Netlify env var to your " +
        "sk_live_... key and redeploy before any customer sees a checkout page.",
    );
  }
  // Same guard for the publishable key — a live sk with a test pk is
  // also broken (the frontend tokenizer would 401), and easier to catch
  // here at the same init point than in the browser bundle.
  const pub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (
    process.env.NODE_ENV === "production" &&
    pub &&
    pub.startsWith("pk_test_")
  ) {
    throw new Error(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a TEST-mode key (pk_test_...) but NODE_ENV is " +
        "production. Update to pk_live_... in Netlify and redeploy.",
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

// Single source of truth lives in lib/plan.ts so session code can grant a
// trial without importing the Stripe SDK. Re-exported here for the call
// sites that already import it from this module.
export { TRIAL_DAYS } from "./plan";

// Resolve a Stripe price ID from a plan choice coming from the UI
// (monthly vs yearly). Defaults to monthly if input is missing or invalid.
export function resolvePriceId(plan: string | undefined | null): string {
  if (plan === "year" || plan === "yearly" || plan === "annual") {
    return STRIPE_PRICE_ID_YEARLY || STRIPE_PRICE_ID_MONTHLY;
  }
  return STRIPE_PRICE_ID_MONTHLY;
}

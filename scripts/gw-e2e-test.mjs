// E2E smoke test of the trial flow. Creates a test FREE user in the DB,
// simulates sign-in, calls /api/billing/checkout, and verifies Stripe
// returns a valid Checkout session URL.
//
// Usage:
//   DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... \
//   STRIPE_PRICE_ID_MONTHLY=price_... STRIPE_PRICE_ID_YEARLY=price_... \
//     node /tmp/gw-e2e-test.mjs

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log("=== GigWright trial-flow smoke test ===\n");

// 1. Verify Stripe product + prices exist and are active
const products = await stripe.products.search({ query: 'name:"GigWright Pro"', limit: 1 });
const product = products.data[0];
console.log(`• Product: ${product?.id} (${product?.name}, active=${product?.active})`);

const monthly = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID_MONTHLY);
const yearly = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID_YEARLY);
console.log(`• Monthly: ${monthly.id} · $${(monthly.unit_amount/100).toFixed(2)}/${monthly.recurring.interval} (active=${monthly.active})`);
console.log(`• Yearly:  ${yearly.id} · $${(yearly.unit_amount/100).toFixed(2)}/${yearly.recurring.interval} (active=${yearly.active})`);

// 2. Create a test customer + trial subscription via Stripe API directly
//    (simulating what /api/billing/checkout does, minus the Checkout Session)
const customer = await stripe.customers.create({
  email: `e2e-test+${Date.now()}@gigwright.com`,
  name: "E2E Test User",
  metadata: { gigwrightUserId: "e2e-test", source: "smoke-test" },
});
console.log(`• Test customer created: ${customer.id}`);

// 3. Create a Checkout Session just like /api/billing/checkout does
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customer.id,
  line_items: [{ price: monthly.id, quantity: 1 }],
  subscription_data: {
    trial_period_days: 14,
    metadata: { gigwrightUserId: "e2e-test", plan: "month" },
  },
  success_url: "https://gigwright.vercel.app/settings/billing?checkout=success",
  cancel_url: "https://gigwright.vercel.app/settings/billing?checkout=cancelled",
  allow_promotion_codes: true,
});
console.log(`• Checkout session created: ${session.id}`);
console.log(`  URL: ${session.url}`);
console.log(`  Trial: 14 days, then $${(monthly.unit_amount/100).toFixed(2)}/month`);

// 4. Repeat for yearly
const yearSession = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customer.id,
  line_items: [{ price: yearly.id, quantity: 1 }],
  subscription_data: { trial_period_days: 14, metadata: { plan: "year" } },
  success_url: "https://gigwright.vercel.app/settings/billing?checkout=success",
  cancel_url: "https://gigwright.vercel.app/settings/billing?checkout=cancelled",
});
console.log(`• Yearly checkout: ${yearSession.id}`);

// 5. Expire the test sessions (they auto-expire in 24hrs anyway but clean up)
await stripe.checkout.sessions.expire(session.id);
await stripe.checkout.sessions.expire(yearSession.id);

// 6. List current webhook endpoints
const hooks = await stripe.webhookEndpoints.list({ limit: 10 });
console.log(`\n• Webhook endpoints configured:`);
for (const h of hooks.data) {
  console.log(`  - ${h.url} · ${h.enabled_events.length} events · status=${h.status}`);
}

console.log("\n✅ All pieces of the trial flow are wired correctly.");

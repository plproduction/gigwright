#!/usr/bin/env node
// One-off: create the GigWright Pro product (if needed) and the two prices —
// $20/month and $200/year — on the current Stripe account/mode.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-prices.mjs
//
// Safe to run more than once: it will reuse an existing "GigWright Pro"
// product if one exists, and will not create duplicate $20/$200 prices.
// Prints the monthly + yearly price IDs at the end so you can paste them
// into Vercel env vars.

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Aborting.");
  process.exit(1);
}
const stripe = new Stripe(key);

const PRODUCT_NAME = "GigWright Pro";

async function findOrCreateProduct() {
  const existing = await stripe.products.search({
    query: `name:"${PRODUCT_NAME}" AND active:"true"`,
    limit: 1,
  });
  if (existing.data[0]) {
    console.log(`• Using existing product ${existing.data[0].id}`);
    return existing.data[0];
  }
  const p = await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      "Bandleader plan — unlimited gigs, roster, two-way calendar sync, diff-aware SMS, QuickBooks push. Musicians always free.",
    metadata: { app: "gigwright" },
  });
  console.log(`• Created product ${p.id}`);
  return p;
}

async function findOrCreatePrice(productId, amountCents, interval, nickname) {
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  const match = prices.data.find(
    (p) =>
      p.active &&
      p.currency === "usd" &&
      p.unit_amount === amountCents &&
      p.recurring?.interval === interval,
  );
  if (match) {
    console.log(`• Using existing ${nickname} price ${match.id}`);
    return match;
  }
  const p = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "usd",
    recurring: { interval },
    nickname,
  });
  console.log(`• Created ${nickname} price ${p.id}`);
  return p;
}

const product = await findOrCreateProduct();
const monthly = await findOrCreatePrice(product.id, 2000, "month", "Monthly");
const yearly = await findOrCreatePrice(product.id, 20000, "year", "Yearly");

console.log("\n=============== Paste these into Vercel env ===============");
console.log(`STRIPE_PRICE_ID_MONTHLY=${monthly.id}`);
console.log(`STRIPE_PRICE_ID_YEARLY=${yearly.id}`);
console.log("===========================================================\n");

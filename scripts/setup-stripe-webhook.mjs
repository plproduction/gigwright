#!/usr/bin/env node
// Creates (or reuses) a Stripe webhook endpoint pointed at GigWright's
// /api/stripe/webhook route, subscribed to the subscription lifecycle
// events we care about, and prints the signing secret so we can put it
// into STRIPE_WEBHOOK_SECRET.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_URL=https://gigwright.vercel.app/api/stripe/webhook \
//     node scripts/setup-stripe-webhook.mjs

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const url = process.env.STRIPE_WEBHOOK_URL;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}
if (!url) {
  console.error("STRIPE_WEBHOOK_URL is not set.");
  process.exit(1);
}
const stripe = new Stripe(key);

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

// Look for an existing endpoint with the same URL so we don't pile up duplicates.
const existingList = await stripe.webhookEndpoints.list({ limit: 100 });
const existing = existingList.data.find((e) => e.url === url);

let endpoint;
if (existing) {
  endpoint = await stripe.webhookEndpoints.update(existing.id, {
    enabled_events: EVENTS,
  });
  console.log(`• Updated existing endpoint ${endpoint.id}`);
} else {
  endpoint = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: "GigWright subscription lifecycle",
  });
  console.log(`• Created new endpoint ${endpoint.id}`);
}

// The signing secret is only returned on the CREATE response, not on
// subsequent fetches. If we updated, we can't read it back — we have to
// rotate it to get a fresh signing secret.
let secret = endpoint.secret;
if (!secret) {
  const rotated = await stripe.webhookEndpoints.update(endpoint.id, {});
  secret = rotated.secret ?? null;
}

if (!secret) {
  console.error(
    "⚠️  Endpoint configured, but Stripe did not return a signing secret.",
  );
  console.error(
    "    Go to the Stripe dashboard → Developers → Webhooks → this endpoint",
  );
  console.error("    → Reveal signing secret, and copy it manually.");
  process.exit(2);
}

console.log("\n=============== Paste this into Vercel env ===============");
console.log(`STRIPE_WEBHOOK_SECRET=${secret}`);
console.log("===========================================================\n");
console.log(`Endpoint URL: ${endpoint.url}`);
console.log(`Subscribed events (${endpoint.enabled_events.length}):`);
for (const e of endpoint.enabled_events) console.log(`  · ${e}`);

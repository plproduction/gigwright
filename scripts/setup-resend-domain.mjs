#!/usr/bin/env node
// Register gigwright.com as a verified sending domain in Resend and print
// the DNS records we need to add at Squarespace. Idempotent — if the
// domain already exists, fetches + prints the existing records.
//
// Usage:
//   AUTH_RESEND_KEY=re_... node scripts/setup-resend-domain.mjs

const apiKey = process.env.AUTH_RESEND_KEY;
if (!apiKey) {
  console.error("AUTH_RESEND_KEY not set. Aborting.");
  process.exit(1);
}

const DOMAIN = "gigwright.com";

async function resend(path, options = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

// 1. Does the domain already exist?
const list = await resend("/domains");
if (!list.ok) {
  console.error("List domains failed:", list.status, list.body);
  process.exit(2);
}

let domain = list.body?.data?.find((d) => d.name === DOMAIN);
if (!domain) {
  console.log(`Creating Resend domain ${DOMAIN}...`);
  const created = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name: DOMAIN, region: "us-east-1" }),
  });
  if (!created.ok) {
    console.error("Create failed:", created.status, created.body);
    process.exit(3);
  }
  domain = created.body;
} else {
  console.log(`Domain already exists: ${domain.id}`);
}

// Fetch full detail (includes records)
const detail = await resend(`/domains/${domain.id}`);
if (!detail.ok) {
  console.error("Fetch detail failed:", detail.status, detail.body);
  process.exit(4);
}

const d = detail.body;
console.log(`\nResend domain: ${d.name}`);
console.log(`Status: ${d.status}`);
console.log(`Region: ${d.region}\n`);

console.log("=== DNS records to add at Squarespace DNS ===\n");
for (const r of d.records ?? []) {
  console.log(`• ${r.record}  (${r.type}${r.priority != null ? ` · pri ${r.priority}` : ""}${r.ttl ? ` · TTL ${r.ttl}` : ""})`);
  console.log(`  Name:  ${r.name}`);
  console.log(`  Value: ${r.value}`);
  console.log(`  Status: ${r.status}\n`);
}

console.log("=============================================");
console.log("Once all records propagate (usually 10–30 min), click");
console.log("Verify on the Resend dashboard or call POST /domains/<id>/verify.");

import type { Config } from "@netlify/functions";

// Netlify Background Function. Kicked by toggleGuestApproval (see
// lib/actions/guest-approval.ts) the moment a guest notification is
// enqueued: it waits out the debounce window, then hits the Next.js
// drain endpoint once. Nothing runs when nothing is queued.
//
// This replaced an every-minute scheduled function (June 2026) that
// kept the Neon database awake 24/7 just to poll an almost-always-empty
// queue — that alone burned through the monthly compute allowance.
//
// Background functions answer the caller with an immediate 202 and can
// run up to 15 minutes, so sleeping ~65s here is fine.
//
// The shared secret in CRON_SECRET stops random internet traffic from
// kicking this (each kick would wake the database). The same secret is
// checked on the Next.js drain route.

// Must be a bit longer than NOTIFY_DELAY_MS in guest-approval.ts so the
// row is due by the time we drain.
const WAIT_MS = 65 * 1000;
const RETRY_DELAYS_MS = [20 * 1000, 60 * 1000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    console.warn("[guest-notify] rejected kick without valid secret");
    return;
  }

  await sleep(WAIT_MS);

  const base = process.env.URL ?? "https://gigwright.com";
  const url = `${base}/api/cron/process-guest-notifications${
    secret ? `?secret=${encodeURIComponent(secret)}` : ""
  }`;

  // One drain, retried a couple of times if the endpoint errors (e.g. a
  // cold database). Draining is idempotent, so a retry can't double-send.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: "POST" });
      const text = await res.text();
      console.log(`[guest-notify] drain ${res.status} ${text}`);
      if (res.ok) return;
    } catch (err) {
      console.error("[guest-notify] drain failed", err);
    }
    if (attempt >= RETRY_DELAYS_MS.length) return;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
};

export const config: Config = {
  background: true,
};

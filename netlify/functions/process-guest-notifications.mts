import type { Config } from "@netlify/functions";

// Netlify Scheduled Function. Fires the Next.js cron endpoint once a
// minute so the PendingGuestNotification queue drains even when the
// bandleader has left the app. Process logic lives in the Next.js
// route — this file is just the cron tick.
//
// The shared secret in CRON_SECRET stops random internet traffic from
// triggering drains. The same secret is checked on the Next.js side.
export default async () => {
  const base = process.env.URL ?? "https://gigwright.com";
  const secret = process.env.CRON_SECRET;
  const url = `${base}/api/cron/process-guest-notifications${
    secret ? `?secret=${encodeURIComponent(secret)}` : ""
  }`;

  try {
    const res = await fetch(url, { method: "POST" });
    const text = await res.text();
    console.log(`[cron-tick] ${res.status} ${text}`);
  } catch (err) {
    console.error("[cron-tick] failed", err);
  }
};

export const config: Config = {
  // Every minute. Smallest delay between user-perceived 2-min debounce
  // and the actual notification firing.
  schedule: "* * * * *",
};

import { NextResponse } from "next/server";
import { processDuePendingNotifications } from "@/lib/actions/guest-approval";

// Cron endpoint that drains the PendingGuestNotification queue. Called
// every minute by a Netlify Scheduled Function (see
// netlify/functions/process-guest-notifications.mts) so the 2-minute
// debounce on guest-approval notifications still fires even when the
// bandleader has walked away from the app.
//
// Auth via a shared secret in the CRON_SECRET env var so random
// internet traffic can't trigger drains. Netlify scheduled function
// passes the secret as a query param. If CRON_SECRET isn't set, we
// fall through (useful for one-off manual triggers during testing) —
// in production it's always set.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const url = new URL(req.url);
    const supplied = url.searchParams.get("secret");
    if (supplied !== expected) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    await processDuePendingNotifications();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cron] processDue failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

// POST allowed too so the Netlify scheduled function can use either
// verb without ceremony.
export async function POST(req: Request) {
  return GET(req);
}

"use client";

import { useState } from "react";

// Quiet "subscribe in your calendar" panel. Hidden behind a small button
// by default so the page doesn't blare a 60-char URL at the user before
// they ask for it. Click "Subscribe in your calendar" → reveals the URL +
// a copy button + a one-line instruction matched to the most common
// calendar app (Apple Calendar / Google).
//
// The url is server-rendered (via ensureMyIcalUrl in lib/actions/ical.ts)
// so on first paint the user already has their personal subscription
// URL — no extra round trip when they expand the panel.
export function CalendarSubscribeCard({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers without clipboard API — let the user select & copy
      // by hand. The URL is already visible.
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
        title="Subscribe to your gigs in Apple Calendar, Google Calendar, or Outlook"
      >
        <span aria-hidden>📅</span>
        Subscribe in your calendar
      </button>
    );
  }

  return (
    <div className="rounded-md border border-line bg-paper-warm/60 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          Calendar subscription
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-ink-mute hover:text-ink"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-soft">
        Paste this URL into Apple Calendar (File → New Calendar Subscription)
        or Google Calendar (Add → From URL). Future gig changes sync within
        an hour.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded border border-line bg-paper px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded border border-line-strong bg-paper px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-[10.5px] text-ink-mute">
        Keep this URL private — anyone with the link sees your gig list.
        Pay amounts are never included.
      </p>
    </div>
  );
}

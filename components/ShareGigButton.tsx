"use client";

import { useState } from "react";

// Copy the public /g/:id URL to clipboard. That's the link you drop in
// iMessage / DMs to musicians who aren't on GigWright yet — they hit a
// read-only gig sheet, no login, no app install.
export function ShareGigButton({ gigId }: { gigId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://www.gigwright.com/g/${gigId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on older Safari / iframes. Fall back to
      // asking the user to copy manually.
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[11.5px] text-ink-soft outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={copy}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
            copied
              ? "bg-success text-paper"
              : "bg-ink text-paper hover:bg-black"
          }`}
        >
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>
      <div className="mt-2 text-[11px] leading-[1.45] text-ink-mute">
        Anyone with this link sees the gig sheet &mdash; call times, venue,
        band first names, set list. Never pay, expenses, or reconciliation.
      </div>
    </div>
  );
}

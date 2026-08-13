"use client";

import { useRef, useState } from "react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

// Referral card on /settings/billing. Shows:
//   - The user's unique referral link with a Copy button
//   - Progress: "N of 3 paying friends — one more and yours is free"
//   - Comp status: "🎁 Your subscription is FREE" when active
//
// The share link points at https://gigwright.com/?ref=CODE. proxy.ts
// picks up the ?ref= on the landing page and stashes it in a cookie
// for 30 days, so the friend who signs up any time in that window
// gets attributed to this user.
export function ReferralCard({
  shareUrl,
  paidCount,
  required,
  compActive,
}: {
  shareUrl: string;
  paidCount: number;
  required: number;
  compActive: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Programmatic copy failed — select the URL so the user can
    // Cmd+C or right-click → Copy manually.
    inputRef.current?.focus();
    inputRef.current?.select();
    inputRef.current?.setSelectionRange(0, shareUrl.length);
  }

  const remaining = Math.max(0, required - paidCount);

  return (
    <div className="mb-8 rounded-[10px] border border-line bg-paper p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
            Refer friends · get GigWright free
          </div>
          <div className="mt-1 font-serif text-[18px] font-light text-ink">
            {compActive ? (
              <>
                <span className="mr-2">🎁</span>Your subscription is
                comped
              </>
            ) : remaining === 0 ? (
              <>Milestone hit — comp applies on next billing cycle</>
            ) : (
              <>
                Refer {required} paying friends, your subscription
                becomes $0
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-serif text-[26px] font-light tabular-nums text-ink">
            {paidCount}
            <span className="text-ink-mute"> / {required}</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            paying friends
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-line bg-paper-warm/50 px-3 py-2">
        {/* Read-only input rather than a plain div so triple-click /
            Cmd+A / right-click → Copy all work as backstops if the
            programmatic copy fails. onFocus + onClick auto-select
            the whole URL for one-tap selection. */}
        <input
          ref={inputRef}
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-ink outline-none"
          aria-label="Your referral link"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-[11.5px] font-semibold text-paper transition-colors hover:bg-black"
        >
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-3 text-[11.5px] leading-[1.55] text-ink-mute">
        Share the link. When a friend signs up and stays past their
        14-day trial (i.e., their card is charged for the first time),
        they count toward your {required}. Hit {required} and a 100%-off
        coupon lands on your subscription — your next invoice is $0.
        If a friend later cancels and you drop below {required}, the
        coupon lifts on the following invoice.
      </div>
    </div>
  );
}

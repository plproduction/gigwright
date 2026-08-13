"use client";

import { useRef, useState } from "react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

// Compact, prominent banner version of the referral card — one strip
// across the top of the dashboard so bandleaders (Patrick included)
// can see the referral link + progress the moment they open the app.
// The full card lives on /settings and /settings/billing; this is the
// discoverability layer.
//
// Hides entirely when compActive=true — once earned, the banner
// disappears so it doesn't nag users who already have the comp.
export function ReferralBanner({
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

  if (compActive) return null;

  async function copy() {
    // Try programmatic copy first (works in most browsers over HTTPS).
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Programmatic copy failed — select the input so the user can
    // hit Cmd+C or right-click → Copy manually. Better than a mystery
    // alert box.
    inputRef.current?.focus();
    inputRef.current?.select();
    inputRef.current?.setSelectionRange(0, shareUrl.length);
  }

  return (
    <div className="mb-5 rounded-[10px] border border-accent/30 bg-accent-soft/50 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-[13px] leading-[1.4]">
          <span className="text-[16px]" aria-hidden="true">
            🎁
          </span>
          <span>
            <strong className="text-ink">
              Refer {required} paying friends → GigWright is free.
            </strong>{" "}
            <span className="text-ink-soft">
              You&rsquo;re at{" "}
              <span className="font-serif tabular-nums text-accent">
                {paidCount} / {required}
              </span>
              .
            </span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Read-only input rather than a plain <span> so triple-
              click / Cmd+A / right-click → Copy all work as backstops
              if the programmatic copy fails on this browser. */}
          <input
            ref={inputRef}
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            className="hidden w-[280px] rounded-md border border-line-strong bg-paper px-2 py-1 font-mono text-[11px] text-ink md:inline"
            aria-label="Your referral link"
          />
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            {copied ? "✓ Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

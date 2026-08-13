"use client";

import { useState } from "react";

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

  if (compActive) return null;

  function copy() {
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        alert(shareUrl);
      },
    );
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
          <span className="hidden font-mono text-[11px] text-ink-mute md:inline">
            {shareUrl}
          </span>
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

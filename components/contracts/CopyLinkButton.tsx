"use client";

import { useRef, useState } from "react";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

// Small client-only copy-to-clipboard button for the admin preview
// bars. Reuses the bulletproof copyToClipboard helper (modern
// clipboard API + document.execCommand fallback). Also focuses a
// hidden input so if BOTH programmatic paths fail, the URL is at
// least selectable for manual copy.
export function CopyLinkButton({
  url,
  label,
  copiedLabel = "✓ Copied",
  className,
}: {
  url: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The client-portal URL is sometimes stored as the path only
  // ("/c/abc"). Resolve to an absolute URL so pasted links work when
  // the bandleader is sending from an email client on a different
  // machine. Server-side `typeof window` is undefined, so guard it.
  const absoluteUrl =
    typeof window !== "undefined" && url.startsWith("/")
      ? `${window.location.origin}${url}`
      : url;

  async function copy() {
    const ok = await copyToClipboard(absoluteUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
    inputRef.current?.setSelectionRange(0, absoluteUrl.length);
  }

  return (
    <>
      <button type="button" onClick={copy} className={className}>
        {copied ? copiedLabel : label}
      </button>
      {/* Off-screen input so the fallback select-to-copy UX works
          even on browsers where both clipboard paths fail. */}
      <input
        ref={inputRef}
        readOnly
        value={absoluteUrl}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0"
      />
    </>
  );
}

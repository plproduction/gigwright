"use client";

import { useState } from "react";

type PaymentMethod =
  | "VENMO"
  | "PAYPAL"
  | "ZELLE"
  | "CASHAPP"
  | "CASH"
  | "CHECK"
  | "DIRECT_DEPOSIT"
  | "OTHER";

// Small pill next to a personnel line: shows the person's preferred payment
// method + address. Clicking it either deep-links to the payment app (Venmo,
// PayPal, Cash App) or copies the address to the clipboard with a toast
// (Zelle, since Zelle has no reliable cross-bank URL scheme).
export function PayAction({
  method,
  address,
  amountCents,
  note,
}: {
  method: PaymentMethod | null;
  address: string | null;
  amountCents?: number;
  note?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!method || !address) return null;

  const amount = amountCents ? (amountCents / 100).toFixed(2) : undefined;
  const label = labelFor(method);

  const deepLink = buildDeepLink(method, address, amount, note);

  if (deepLink) {
    return (
      <a
        href={deepLink}
        target="_blank"
        rel="noreferrer"
        title={`Pay ${formatAddr(method, address)} via ${label}`}
        className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent hover:bg-accent hover:text-paper"
      >
        <span>{label}</span>
        <span className="text-[9px] opacity-70">→</span>
      </a>
    );
  }

  // Zelle / Cash / Check / Direct Deposit / Other — copy to clipboard
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label} address: ${address}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
        copied
          ? "border-success bg-success/10 text-success"
          : "border-accent/25 bg-accent-soft text-accent hover:bg-accent hover:text-paper"
      }`}
    >
      <span>{label}</span>
      <span className="text-[9px] opacity-70">{copied ? "✓" : "⎘"}</span>
    </button>
  );
}

function labelFor(m: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    VENMO: "Venmo",
    PAYPAL: "PayPal",
    ZELLE: "Zelle",
    CASHAPP: "Cash App",
    CASH: "Cash",
    CHECK: "Check",
    DIRECT_DEPOSIT: "ACH",
    OTHER: "Pay",
  };
  return map[m];
}

// People put all sorts of things in the payment-address field: "@jsmith",
// "$jsmith", "jsmith", a pasted venmo.com/jsmith profile URL, or an email
// address. Strip the decoration down to the bare handle.
function bareHandle(address: string): string {
  return address
    .trim()
    .replace(/^https?:\/\/(www\.)?(venmo\.com|cash\.app|paypal\.me)\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/^[@$]/, "")
    .replace(/\/+$/, "");
}

// An email or phone number is a perfectly good thing to have on file, but
// it is NOT a username — pasting one into the path gives you
// paypal.me/jsmith@gmail.com/350, which is a dead link that looks alive.
function looksLikeEmailOrPhone(s: string): boolean {
  return s.includes("@") || /^[\d\s()+.-]{7,}$/.test(s);
}

function buildDeepLink(
  method: PaymentMethod,
  address: string,
  amount?: string,
  note?: string,
): string | null {
  const handle = bareHandle(address);
  if (!handle) return null;
  const isContact = looksLikeEmailOrPhone(handle);

  switch (method) {
    case "VENMO": {
      // Venmo takes a username in the path, but an email or phone has to
      // go through `recipients` instead.
      const params = new URLSearchParams({ txn: "pay" });
      if (amount) params.set("amount", amount);
      if (note) params.set("note", note);
      if (isContact) {
        params.set("recipients", handle);
        return `https://venmo.com/?${params}`;
      }
      return `https://venmo.com/${encodeURIComponent(handle)}?${params}`;
    }
    case "PAYPAL": {
      // paypal.me only works with a PayPal.Me handle. With an email on
      // file there's no prefilled send link, so fall through to
      // copy-to-clipboard rather than hand over a broken one.
      if (isContact) return null;
      return `https://paypal.me/${encodeURIComponent(handle)}${amount ? `/${amount}` : ""}`;
    }
    case "CASHAPP": {
      // Cash App takes the amount as a path segment and supports no note.
      if (isContact) return null;
      return `https://cash.app/$${encodeURIComponent(handle)}${amount ? `/${amount}` : ""}`;
    }
    // No reliable deep link for the rest — fall through to copy-to-clipboard
    default:
      return null;
  }
}

function formatAddr(method: PaymentMethod, address: string): string {
  if (method === "VENMO") return address.startsWith("@") ? address : `@${address}`;
  if (method === "CASHAPP") return address.startsWith("$") ? address : `$${address}`;
  return address;
}

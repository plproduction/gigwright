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

function buildDeepLink(
  method: PaymentMethod,
  address: string,
  amount?: string,
  note?: string,
): string | null {
  const cleanHandle = address.replace(/^@/, "").replace(/^\$/, "").trim();
  const noteEnc = note ? encodeURIComponent(note) : "";

  switch (method) {
    case "VENMO": {
      // Venmo handles the amount/note params; works on mobile app + web
      const amt = amount ? `&amount=${amount}` : "";
      const n = note ? `&note=${noteEnc}` : "";
      return `https://venmo.com/${encodeURIComponent(cleanHandle)}?txn=pay${amt}${n}`;
    }
    case "PAYPAL": {
      // paypal.me/<user>/<amount>
      const isUrl = /^https?:\/\//i.test(address);
      if (isUrl) {
        return amount ? `${address.replace(/\/$/, "")}/${amount}` : address;
      }
      return `https://paypal.me/${encodeURIComponent(cleanHandle)}${amount ? `/${amount}` : ""}`;
    }
    case "CASHAPP": {
      return `https://cash.app/$${encodeURIComponent(cleanHandle)}${amount ? `/${amount}` : ""}`;
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

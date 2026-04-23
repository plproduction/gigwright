"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllPaid } from "@/lib/actions/gigs";

// Single-click bulk "mark everyone paid today". Opens a method picker
// inline — Venmo / Zelle / Check / Cash / other — then marks every
// unpaid GigPersonnel on the gig as paid today via that method.
export function MarkAllPaidButton({
  gigId,
  unpaidCount,
}: {
  gigId: string;
  unpaidCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (unpaidCount === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-ink-mute">
        <span className="text-success">✓</span>
        <span>Everyone paid</span>
      </div>
    );
  }

  function apply(method: string) {
    startTransition(async () => {
      const res = await markAllPaid(gigId, method);
      setResult(
        `Marked ${res.count} musician${res.count === 1 ? "" : "s"} paid via ${method.toLowerCase()}`,
      );
      setOpen(false);
      router.refresh();
      setTimeout(() => setResult(null), 3500);
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-accent hover:text-accent"
          title={`Mark ${unpaidCount} unpaid musician${unpaidCount === 1 ? "" : "s"} paid today`}
        >
          <span>Mark all paid</span>
          <span className="text-[11px] text-ink-mute">
            ({unpaidCount} unpaid)
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-mute">How?</span>
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => apply(m.value)}
              disabled={pending}
              className="rounded-md bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper hover:bg-black disabled:opacity-50"
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-1 text-[11px] text-ink-mute hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}
      {result && (
        <span className="text-[11px] text-success">{result}</span>
      )}
    </div>
  );
}

const METHODS: Array<{ value: string; label: string }> = [
  { value: "VENMO", label: "Venmo" },
  { value: "ZELLE", label: "Zelle" },
  { value: "CASHAPP", label: "Cash App" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "CHECK", label: "Check" },
  { value: "CASH", label: "Cash" },
  { value: "DIRECT_DEPOSIT", label: "Direct deposit" },
  { value: "OTHER", label: "Other" },
];

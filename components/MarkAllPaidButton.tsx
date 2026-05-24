"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllPaid } from "@/lib/actions/gigs";
import { pickerOptions } from "@/lib/payment-methods";

// Single-click bulk "mark everyone paid today". Opens a method picker
// inline — Venmo / Cash App / Check / Cash / other — then marks every
// unpaid GigPersonnel on the gig as paid today via that method. Methods
// the bandleader has opted out of on Settings render as a disabled,
// muted chip so the row stays scannable (the leader can SEE the method
// exists, just can't click it).
export function MarkAllPaidButton({
  gigId,
  unpaidCount,
  enabledPaymentMethods = [],
}: {
  gigId: string;
  unpaidCount: number;
  enabledPaymentMethods?: string[];
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
          {pickerOptions(enabledPaymentMethods).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => !m.disabled && apply(m.value)}
              disabled={pending || m.disabled}
              title={
                m.disabled
                  ? `You don't currently accept ${m.value.toLowerCase()} — enable on Settings → Payment methods`
                  : undefined
              }
              className={
                m.disabled
                  ? "cursor-not-allowed rounded-md border border-line-strong bg-paper-warm px-2.5 py-1 text-[11px] font-semibold text-ink-mute"
                  : "rounded-md bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper hover:bg-black disabled:opacity-50"
              }
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


"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPaidQuick, unmarkPaid } from "@/lib/actions/gigs";

// One-click "mark paid" affordance per musician row. Two states:
//
//   Unpaid →  [ Mark paid ]              (small dark chip)
//   Paid   →  ✓ Paid May 24 · Unpay      (muted text + tiny undo link)
//
// markPaidQuick uses the musician's preferred paymentMethod from their
// roster row, falling back to OTHER. No method picker — that's the
// "Mark all paid" flow's job. This is for paying people one at a time
// while you're Venmo-ing them.
export function MarkPaidChip({
  personnelId,
  paidAt,
  onPaidChange,
}: {
  personnelId: string;
  paidAt: Date | string | null;
  // Optional callback — when the chip is hosted inside a state-managed
  // form like PayoutWorksheet, the parent passes this so the row's local
  // paidDate state stays in sync with the server. Without it, the chip
  // works fine but the surrounding form's Save button would overwrite
  // the chip's change on next worksheet save.
  onPaidChange?: (paidAt: Date | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function mark() {
    startTransition(async () => {
      await markPaidQuick(personnelId);
      onPaidChange?.(new Date());
      router.refresh();
    });
  }

  function unmark() {
    startTransition(async () => {
      await unmarkPaid(personnelId);
      onPaidChange?.(null);
      router.refresh();
    });
  }

  if (paidAt) {
    const d = typeof paidAt === "string" ? new Date(paidAt) : paidAt;
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] text-success">
        <span className="font-semibold">✓ Paid {label}</span>
        <button
          type="button"
          onClick={unmark}
          disabled={pending}
          className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-mute underline-offset-2 hover:text-accent hover:underline disabled:opacity-50"
          title="Undo — clear the paid status on this row"
        >
          Unpay
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={mark}
      disabled={pending}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-line-strong bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft transition-colors hover:border-accent hover:bg-accent hover:text-paper disabled:opacity-50"
      title="Mark this musician paid today (uses their preferred payment method)"
    >
      {pending ? "Marking…" : "Mark paid"}
    </button>
  );
}

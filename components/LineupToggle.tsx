"use client";

import { useOptimistic, useTransition } from "react";
import { setPersonnelIncludeInLineup } from "@/lib/actions/gigs";

// A small, deliberately quiet toggle that controls whether a personnel
// row appears in the Lineup section of outgoing band emails. Lives at
// the right edge of each Personnel row.
//
// Visual vocabulary borrowed from the rest of the gig page: warm paper
// background, hairline LINE border, accent burgundy fill when checked,
// a faint gold-leaf hairline rule on focus. Reads as a fine-tipped
// checkbox you'd see on a Ritz-Carlton concierge sheet — not a
// utilitarian web form control.
export function LineupToggle({
  gigId,
  personnelId,
  initial,
  musicianName,
}: {
  gigId: string;
  personnelId: string;
  initial: boolean;
  musicianName: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      await setPersonnelIncludeInLineup(gigId, personnelId, next);
    });
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={`${optimistic ? "Hide" : "Show"} ${musicianName} in outgoing email lineup`}
      onClick={toggle}
      disabled={pending}
      className={[
        "group relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px]",
        "border transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        optimistic
          ? "border-accent bg-accent text-paper shadow-[0_1px_2px_rgba(107,31,21,0.15)]"
          : "border-line-strong bg-paper hover:border-accent/60 hover:bg-paper-warm",
        pending ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* Hairline checkmark — thin stroke, slightly inset so the check
          reads as drawn-on rather than stamped. Fades in on toggle. */}
      <svg
        viewBox="0 0 14 14"
        aria-hidden="true"
        className={`h-[12px] w-[12px] transition-opacity duration-150 ${optimistic ? "opacity-100" : "opacity-0"}`}
      >
        <path
          d="M3 7.2 L5.8 10 L11 4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

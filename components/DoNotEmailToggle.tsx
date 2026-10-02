"use client";

import { useOptimistic, useTransition } from "react";
import { setPersonnelDoNotEmail } from "@/lib/actions/gigs";

// Per-gig "Do not email" checkbox at the far right of each Personnel
// row (Patrick 2026-10-01). Checked = this person is skipped by every
// email path for this gig: Send update / gig alert, the Accept/Decline
// invite, and guest approval notices. Built for festival gigs where
// whole tribute bands and sponsors sit on the personnel list.
//
// Same fine-tipped checkbox vocabulary as LineupToggle so the two
// columns read as a matched pair — accent burgundy fill when checked,
// hairline LINE border when not.
export function DoNotEmailToggle({
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
      await setPersonnelDoNotEmail(gigId, personnelId, next);
    });
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={optimistic}
      aria-label={`Do not email or text ${musicianName} about this gig`}
      title={
        optimistic
          ? `${musicianName} will NOT be emailed about this gig (alerts, updates, invites). Click to put them back on the email list.`
          : `Check to stop emailing ${musicianName} about this gig.`
      }
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

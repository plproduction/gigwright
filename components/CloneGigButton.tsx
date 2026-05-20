"use client";

import { useRef, useState, useTransition } from "react";
import { cloneGig } from "@/lib/actions/gigs";

// Duplicate a gig — creates a fresh INQUIRY gig on the user-picked date,
// with the same venue + personnel + tech/attire/set list + notes. Times of
// day (load-in, soundcheck, downbeat, etc.) carry over from the source, so
// only the calendar day shifts. The user is redirected to the new gig's
// edit page.
//
// UX: button click reveals an inline date input (no modal). User picks a
// date, clicks Clone. We default the picker to one week out from the source
// gig's date as a soft suggestion, but the user has to interact with it —
// no silent "clone landed on a random Tuesday next week" surprise.
export function CloneGigButton({
  gigId,
  variant = "ghost",
  sourceStartAt,
}: {
  gigId: string;
  variant?: "ghost" | "solid";
  // ISO date of the source gig (YYYY-MM-DD), used to suggest a default
  // value in the date input. Optional — if omitted we use today.
  sourceStartAt?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Suggested default: 7 days after the source gig's date. Same heuristic
  // as before — most clones repeat weekly. But the user has to confirm.
  function suggestedDate(): string {
    const base = sourceStartAt
      ? new Date(sourceStartAt)
      : new Date();
    base.setDate(base.getDate() + 7);
    return base.toISOString().slice(0, 10);
  }

  function submit() {
    const value = dateInputRef.current?.value;
    if (!value) return;
    startTransition(async () => {
      await cloneGig(gigId, value);
    });
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50";
  const styles =
    variant === "solid"
      ? "bg-ink text-paper hover:bg-black"
      : "border border-line-strong bg-transparent text-ink hover:bg-paper-warm";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={`${base} ${styles}`}
        title="Clone this gig — pick a date, keep the same venue + personnel + tech"
      >
        Clone gig
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={dateInputRef}
        type="date"
        defaultValue={suggestedDate()}
        autoFocus
        disabled={pending}
        className="rounded-md border border-line-strong bg-paper px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={`${base} bg-ink text-paper hover:bg-black`}
      >
        {pending ? "Cloning…" : "Clone"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="rounded-md px-2 py-1.5 text-[12px] font-medium text-ink-mute hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

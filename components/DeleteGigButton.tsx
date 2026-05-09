"use client";

import { useState, useTransition } from "react";

// Destructive "Delete gig" action — gated behind a two-step confirm so a
// stray click can't wipe a gig and its activity log. Click once, the
// button morphs into "Yes, delete this gig" with a Cancel link; click it
// again to actually fire the bound server action.
//
// Lives in its own client component because the Edit page is a server
// component (the form uses server actions) and we need useState/useTransition
// for the confirm flow + pending state.
export function DeleteGigButton({
  action,
  venueLabel,
}: {
  // Bound server action: signature after .bind(null, gig.id) is
  // () => Promise<void> — no formData needed, just fire it.
  action: () => void | Promise<void>;
  venueLabel: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-md border border-line-strong bg-paper px-4 py-2 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-soft hover:border-accent"
      >
        Delete gig…
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            Promise.resolve(action()).catch(() => {});
          })
        }
        className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-paper transition-colors hover:bg-[#611B11] disabled:opacity-60"
      >
        {pending ? "Deleting…" : `Yes, delete ${venueLabel}`}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="rounded-md border border-line-strong bg-transparent px-3 py-2 text-[12.5px] font-medium text-ink-soft hover:bg-paper-warm"
      >
        Keep it
      </button>
    </div>
  );
}

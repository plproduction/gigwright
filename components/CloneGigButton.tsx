"use client";

import { useTransition } from "react";
import { cloneGig } from "@/lib/actions/gigs";

// Duplicate a gig — creates a fresh INQUIRY gig dated one week out, with
// the same venue + personnel + tech/attire/set list + notes. The user is
// redirected to the new gig's edit page. Useful for repeating gigs.
export function CloneGigButton({
  gigId,
  variant = "ghost",
}: {
  gigId: string;
  variant?: "ghost" | "solid";
}) {
  const [pending, startTransition] = useTransition();

  function clone() {
    startTransition(async () => {
      await cloneGig(gigId);
    });
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50";
  const styles =
    variant === "solid"
      ? "bg-ink text-paper hover:bg-black"
      : "border border-line-strong bg-transparent text-ink hover:bg-paper-warm";

  return (
    <button
      type="button"
      onClick={clone}
      disabled={pending}
      className={`${base} ${styles}`}
      title="Clone this gig — fresh INQUIRY one week out, same venue + personnel + tech"
    >
      {pending ? "Cloning…" : "Clone gig"}
    </button>
  );
}

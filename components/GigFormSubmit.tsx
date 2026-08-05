"use client";

import { useFormStatus } from "react-dom";

// Save button for GigForm. Client-only wrapper so useFormStatus() has
// access to the parent form's pending state — a plain
// <button type="submit"> in a Server Component can be clicked
// repeatedly while the server action runs, which is exactly the
// "hit save five times and got five gigs" bug Patrick hit on
// 2026-07-27. Disabling while pending kills that class of dupe.
//
// Both the top and bottom Save buttons should use this — either one
// firing multiple times without disable protection is the same bug.
export function GigFormSubmit({
  className,
  idleLabel,
  pendingLabel = "Saving…",
}: {
  className?: string;
  idleLabel: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} ${pending ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

"use client";

import { useRef, useState } from "react";

// Time input + small "None" clear button. Native browser time inputs have
// inconsistent clear affordances across Chrome / Safari / Firefox — some
// show an ✕, some don't, and on a clone-with-stale-times the bandleader
// often can't figure out how to wipe a value back to empty. This wrapper
// makes the "set this to NONE" affordance explicit and the same
// everywhere.
//
// The input itself still posts under the given `name`, so server-side
// upsertGig sees an empty string when None is clicked — and treats
// empty string as null (existing behavior). No server-side change
// needed for this UX fix.
export function OptionalTimeInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Track current value so the None button can disable itself when the
  // field is already blank. Avoids a no-op click + lets us style the
  // button as muted when there's nothing to clear.
  const [hasValue, setHasValue] = useState(defaultValue !== "");

  function clear() {
    if (!ref.current) return;
    ref.current.value = "";
    setHasValue(false);
    // Some browsers won't fire change for a programmatic value reset.
    // Dispatching explicitly keeps any parent state-watchers in sync.
    ref.current.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="time"
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => setHasValue(e.target.value !== "")}
        className="input flex-1"
      />
      <button
        type="button"
        onClick={clear}
        disabled={!hasValue}
        className="shrink-0 rounded border border-line bg-paper px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-mute"
        title="Clear this time — none required for this gig"
      >
        None
      </button>
    </div>
  );
}

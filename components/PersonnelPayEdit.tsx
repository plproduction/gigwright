"use client";

import { useRef, useState, useTransition } from "react";

// Inline pay editor for a personnel row on the GigForm.
//
// Why a client component: we want pay to commit on blur (so the bandleader
// can tab through musicians and dial things in) AND on Enter, with a tiny
// "saving…" affordance. Server actions can be invoked from client
// components by reference, so we accept the bound action as a prop and
// fire it via startTransition.
export function PersonnelPayEdit({
  initialCents,
  action,
  musicianName,
}: {
  initialCents: number;
  // Bound server action: signature after .bind(null, gigId, personnelId)
  // is (formData: FormData) => Promise<void>.
  action: (formData: FormData) => void | Promise<void>;
  musicianName: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [savedTick, setSavedTick] = useState(0);

  const initialDisplay = (initialCents / 100).toFixed(
    initialCents % 100 === 0 ? 0 : 2,
  );
  const [lastSaved, setLastSaved] = useState(initialDisplay);

  // Submit only if the value actually changed — avoids hammering the server
  // when the bandleader tabs through without editing.
  function maybeSubmit(currentValue: string) {
    if (currentValue.trim() === lastSaved) return;
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => {
      Promise.resolve(action(fd)).then(() => {
        setLastSaved(currentValue.trim());
        setSavedTick((t) => t + 1);
      });
    });
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        // Let the form submit normally on Enter; just record the new value.
        const value = (e.currentTarget.elements.namedItem("pay") as HTMLInputElement | null)?.value ?? "";
        setLastSaved(value.trim());
      }}
      className="flex items-center gap-1"
    >
      <span className="font-serif text-ink-mute">$</span>
      <input
        type="text"
        name="pay"
        inputMode="decimal"
        defaultValue={initialDisplay}
        onBlur={(e) => maybeSubmit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            maybeSubmit((e.currentTarget as HTMLInputElement).value);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="w-[80px] rounded-md border border-line bg-paper px-2 py-1 text-right font-serif text-[14px] tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        aria-label={`Pay for ${musicianName}`}
        disabled={pending}
      />
      {pending ? (
        <span
          className="text-[10px] uppercase tracking-[0.1em] text-ink-mute"
          aria-live="polite"
        >
          …
        </span>
      ) : savedTick > 0 ? (
        <span
          key={savedTick}
          className="text-[10px] uppercase tracking-[0.1em] text-success"
          aria-live="polite"
        >
          Saved
        </span>
      ) : (
        <span className="w-[36px]" aria-hidden="true" />
      )}
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// Type to narrow a server-rendered list in place. Each row in the target
// container carries data-filter-key; rows that don't match get hidden.
//
// Deliberately NOT a client-rendered list. The rows are forms bound to
// server actions (rename, reorder, delete, add to call list) and they work
// today — turning the list into a client component to get a filter would
// mean threading a dozen bound actions through props for a cosmetic win.
// Hiding non-matches leaves every one of those forms exactly as it is.
//
// Hidden rather than unmounted on purpose: a half-typed rename in a row
// you filtered past is still there when you clear the box.
//
// The filtering runs in the change handler, not an effect. An effect would
// mean render → paint → mutate DOM → setState → render again for every
// keystroke; doing it inline keeps it to one pass, and the only thing left
// for an effect is putting the rows back if this ever unmounts mid-filter.
export function FilterRows({
  targetId,
  placeholder,
  noun = "rows",
}: {
  targetId: string;
  placeholder: string;
  noun?: string;
}) {
  const [q, setQ] = useState("");
  const [hiddenCount, setHiddenCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function apply(value: string) {
    setQ(value);
    const container = document.getElementById(targetId);
    if (!container) return;
    const needle = value.trim().toLowerCase();
    let hidden = 0;
    for (const el of container.querySelectorAll<HTMLElement>("[data-filter-key]")) {
      const show = !needle || (el.dataset.filterKey ?? "").toLowerCase().includes(needle);
      el.hidden = !show;
      if (!show) hidden++;
    }
    setHiddenCount(hidden);
  }

  // Unmount only: never leave rows hidden behind us.
  useEffect(() => {
    return () => {
      const container = document.getElementById(targetId);
      if (!container) return;
      for (const el of container.querySelectorAll<HTMLElement>("[data-filter-key]")) {
        el.hidden = false;
      }
    };
  }, [targetId]);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => apply(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") apply("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input py-1 text-[11px]"
        style={{ width: 150 }}
      />
      {q.trim() !== "" && (
        <span className="text-[11px] text-ink-mute" aria-live="polite">
          {hiddenCount > 0 ? `${hiddenCount} ${noun} hidden · ` : ""}
          <button
            type="button"
            onClick={() => {
              apply("");
              inputRef.current?.focus();
            }}
            className="text-accent hover:underline"
          >
            clear
          </button>
        </span>
      )}
    </div>
  );
}

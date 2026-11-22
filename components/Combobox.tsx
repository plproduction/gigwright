"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string };

// Type a few letters, pick from what comes up. Replaces a <select> whose
// option list had grown to 256 names — at that size a dropdown is a filing
// cabinet you scroll, not a control you use.
//
// Submits the enclosing form on pick, exactly like AutoSubmitSelect did, so
// the server action and progressive enhancement are unchanged: the real
// value rides in a hidden input of the same `name`.
//
// Matching is substring, case-insensitive, on word starts first — typing
// "geo" puts "George Shelby" above "Dan Georgeson", because the thing you
// half-remember is almost always the start of a word.
export function Combobox({
  name,
  options,
  placeholder,
  className,
  ariaLabel,
  // When set, typing something that matches nothing offers to create it,
  // posting the raw text under this field name instead of `name`. That's
  // how a new role gets added without a trip to another page.
  createName,
  createLabel = (q: string) => `Create “${q}”`,
}: {
  name: string;
  options: ComboOption[];
  placeholder: string;
  className?: string;
  ariaLabel?: string;
  createName?: string;
  createLabel?: (q: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    const scored: { o: ComboOption; rank: number }[] = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      const at = l.indexOf(q);
      if (at === -1) continue;
      // 0 = starts the label, 1 = starts a word, 2 = anywhere
      const rank = at === 0 ? 0 : /\s/.test(l[at - 1] ?? "") ? 1 : 2;
      scored.push({ o, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || a.o.label.localeCompare(b.o.label));
    return scored.slice(0, 50).map((s) => s.o);
  }, [options, query]);

  const canCreate =
    Boolean(createName) &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const rowCount = matches.length + (canCreate ? 1 : 0);

  // Close when the click lands anywhere else. Without this the list stays
  // open behind the next thing you click, which looks broken.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(index: number) {
    const form = hiddenRef.current?.form;
    if (!form) return;
    if (index >= matches.length) {
      // The create row.
      if (!createRef.current) return;
      createRef.current.value = query.trim();
      if (hiddenRef.current) hiddenRef.current.value = "";
    } else {
      const picked = matches[index];
      if (!picked || !hiddenRef.current) return;
      hiddenRef.current.value = picked.value;
      if (createRef.current) createRef.current.value = "";
    }
    setOpen(false);
    setQuery("");
    form.requestSubmit();
  }

  return (
    <div ref={wrapRef} className="relative">
      <input ref={hiddenRef} type="hidden" name={name} />
      {createName && <input ref={createRef} type="hidden" name={createName} />}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Reset the highlight here rather than in an effect on `query`:
          // an effect would re-render a second time on every keystroke.
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, rowCount - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            // Always swallow Enter: letting it through submits the form
            // with an empty hidden field, which the server action reads as
            // "no selection" and silently does nothing.
            e.preventDefault();
            if (open && rowCount > 0) choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && rowCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-[calc(100%+3px)] z-30 max-h-[260px] min-w-[220px] overflow-auto rounded-[8px] border border-line-strong bg-paper py-1 shadow-[0_6px_20px_rgb(14_12_9_/_0.12)]"
        >
          {matches.map((o, i) => (
            <li key={o.value} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`block w-full px-3 py-1.5 text-left text-[12px] ${
                  i === active ? "bg-accent-soft text-accent" : "text-ink"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={active === matches.length}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(matches.length)}
                onClick={() => choose(matches.length)}
                className={`block w-full border-t border-line px-3 py-1.5 text-left text-[12px] font-medium ${
                  active === matches.length
                    ? "bg-accent-soft text-accent"
                    : "text-accent"
                }`}
              >
                {createLabel(query.trim())}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

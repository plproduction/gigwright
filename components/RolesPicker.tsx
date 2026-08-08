"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTED_ROLES } from "@/lib/roles";

// Dropdown-based multi-picker for the roster musician form's `roles`
// field. Click the trigger to open a panel listing each canonical
// role (Bass / Drums / Guitar / Piano / Keys / Vocals / Sax /
// Trumpet / Trombone / PRODUCER) with a checkbox. Selected roles
// show as a compact summary on the trigger button.
//
// Existing roles on the musician (freeform text, comma-separated in
// the underlying input) are pre-selected on mount. Custom roles the
// bandleader typed in the past (e.g., "Arranger", "Music Director",
// "Fiddle") appear at the TOP of the panel as pre-checked options so
// they're preserved rather than dropped when re-editing.
//
// The underlying hidden input stays comma-separated so the existing
// server action (musicians.ts) that splits by comma works unchanged.
export function RolesPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  // Parse the incoming freeform text into a list. Preserve original
  // casing for custom roles ("Arranger") so re-saving doesn't mangle
  // them, but canonical-role matching is case-insensitive.
  const initial = defaultValue
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const [selected, setSelected] = useState<string[]>(initial);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const canonicalLower = new Set(
    SUGGESTED_ROLES.map((r) => r.toLowerCase()),
  );
  const customRoles = selected.filter(
    (r) => !canonicalLower.has(r.toLowerCase()),
  );
  const options: string[] = [...customRoles, ...SUGGESTED_ROLES];

  function toggle(role: string) {
    const lower = role.toLowerCase();
    if (selected.some((s) => s.toLowerCase() === lower)) {
      setSelected(selected.filter((s) => s.toLowerCase() !== lower));
    } else {
      setSelected([...selected, role]);
    }
  }

  const value = selected.join(", ");
  const summary =
    selected.length === 0
      ? "Select roles…"
      : selected.length <= 3
        ? selected.join(", ")
        : `${selected.slice(0, 2).join(", ")} +${selected.length - 2} more`;

  return (
    <div className="relative" ref={panelRef}>
      {/* Hidden input is what the form actually submits — keeps the
          server-side parser (comma-split) working unchanged. */}
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={
            selected.length === 0 ? "text-ink-mute" : "text-ink"
          }
        >
          {summary}
        </span>
        <span className="ml-2 text-[10px] text-ink-mute" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[280px] overflow-y-auto rounded-md border border-line-strong bg-paper shadow-lg"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-ink-mute">
              No roles available.
            </div>
          ) : (
            options.map((role) => {
              const active = selected.some(
                (s) => s.toLowerCase() === role.toLowerCase(),
              );
              const isProducer = role.toUpperCase() === "PRODUCER";
              const isCustom = !canonicalLower.has(role.toLowerCase());
              return (
                <label
                  key={role}
                  className={`flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0 hover:bg-paper-warm ${
                    active ? "bg-paper-warm/60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(role)}
                    className="h-3.5 w-3.5"
                  />
                  <span
                    className={
                      isProducer
                        ? "font-semibold text-accent"
                        : "text-ink"
                    }
                  >
                    {role}
                  </span>
                  {isCustom && (
                    <span className="ml-auto text-[10px] italic text-ink-mute">
                      custom
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

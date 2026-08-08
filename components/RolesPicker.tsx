"use client";

import { useState } from "react";
import { SUGGESTED_ROLES } from "@/lib/roles";

// Chip-based picker for the roster musician form's `roles` field.
// The underlying <input> stays comma-separated freeform text so
// existing form submissions work unchanged; the picker just makes
// tagging faster by clicking chips instead of typing.
//
// Clicking a chip toggles it in the roles list:
//   - If not in the list → added at the end
//   - If already in the list → removed
//
// Freeform additions (typing "Fiddle") are preserved when chips are
// clicked — we only modify the entries that match a chip label.
export function RolesPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);

  const currentRoles = value
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const currentSet = new Set(currentRoles.map((r) => r.toLowerCase()));

  function toggle(role: string) {
    const lower = role.toLowerCase();
    if (currentSet.has(lower)) {
      const next = currentRoles.filter((r) => r.toLowerCase() !== lower);
      setValue(next.join(", "));
    } else {
      const next = [...currentRoles, role];
      setValue(next.join(", "));
    }
  }

  return (
    <div className="space-y-2">
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Drums, Percussion"
        className="input"
      />
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_ROLES.map((role) => {
          const active = currentSet.has(role.toLowerCase());
          const isProducer = role === "PRODUCER";
          return (
            <button
              key={role}
              type="button"
              onClick={() => toggle(role)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? isProducer
                    ? "border-accent bg-accent text-paper"
                    : "border-ink bg-ink text-paper"
                  : isProducer
                    ? "border-accent/40 bg-paper text-accent hover:bg-accent-soft"
                    : "border-line-strong bg-paper text-ink-soft hover:border-accent hover:text-accent"
              }`}
              title={`${active ? "Remove" : "Add"} ${role}`}
            >
              {role}
            </button>
          );
        })}
      </div>
    </div>
  );
}

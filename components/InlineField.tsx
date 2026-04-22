"use client";

import { useState, useTransition } from "react";
import { updateGigField } from "@/lib/actions/gigs";

type Field = "notes" | "materialsUrl" | "setlistUrl";

// Click-to-edit inline field. Blur or ⌘↵ saves; Escape cancels.
// Renders the current value as display text when not editing.
export function InlineField({
  gigId,
  field,
  initialValue,
  multiline,
  placeholder,
  renderDisplay,
}: {
  gigId: string;
  field: Field;
  initialValue: string | null;
  multiline?: boolean;
  placeholder?: string;
  // Optional custom renderer for the display state (e.g. render URL as a link)
  renderDisplay?: (value: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState<string | null>(initialValue);
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === (saved ?? "")) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateGigField(gigId, field, trimmed === "" ? null : trimmed);
      setSaved(trimmed === "" ? null : trimmed);
      setEditing(false);
    });
  };

  const cancel = () => {
    setValue(saved ?? "");
    setEditing(false);
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          }}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-md border border-accent/40 bg-paper px-3 py-2 text-[13px] leading-[1.5] text-ink outline-none focus:border-accent"
          disabled={pending}
        />
      );
    }
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") commit();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-accent/40 bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
        disabled={pending}
      />
    );
  }

  // Display state — clickable to enter edit mode
  const display = saved ?? "";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`cursor-text rounded-md border border-transparent px-3 py-2 transition-colors hover:border-line hover:bg-paper/60 ${
        multiline ? "min-h-[72px]" : ""
      }`}
    >
      {display ? (
        renderDisplay ? (
          renderDisplay(display)
        ) : (
          <div className="whitespace-pre-wrap text-[13px] leading-[1.5] text-ink-soft">
            {display}
          </div>
        )
      ) : (
        <div className="text-[12px] italic text-ink-mute">
          {placeholder ?? "Click to add"}
        </div>
      )}
    </div>
  );
}

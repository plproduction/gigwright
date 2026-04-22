"use client";

import { useState, useTransition } from "react";
import { updateGigField } from "@/lib/actions/gigs";

type Field = "notes" | "materialsUrl" | "setlistUrl";

// Click-to-edit inline field. Blur or ⌘↵ saves; Escape cancels.
// Renders the current value as display text when not editing.
// For URL fields, pass displayAs="link" (+ optional linkLabel) so the saved
// value renders as a clickable hyperlink. For plain text, omit displayAs.
export function InlineField({
  gigId,
  field,
  initialValue,
  multiline,
  placeholder,
  displayAs,
  linkLabel,
}: {
  gigId: string;
  field: Field;
  initialValue: string | null;
  multiline?: boolean;
  placeholder?: string;
  displayAs?: "text" | "link";
  linkLabel?: string | null;
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
  const enterEdit = () => setEditing(true);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={enterEdit}
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
        displayAs === "link" ? (
          <a
            href={display}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block truncate font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            {linkLabel ?? displayUrl(display)}
          </a>
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

function displayUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + (url.pathname.length > 1 ? url.pathname : "");
  } catch {
    return u;
  }
}

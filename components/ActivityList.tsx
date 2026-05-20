"use client";

import { useState } from "react";

// Compact activity feed for the gig detail page. Fully collapsed by default
// — shows one line ("N activity entries · Show") and reveals the list when
// clicked. Activity is a debugging/audit surface, not something a
// bandleader needs to see every time they open a gig sheet, so it should
// pay for its vertical space only when the user actively asks for it.
//
// We accept a fully-rendered list of entries (already typed and formatted
// upstream) so this component stays presentational — the server page does
// the DB read and the date formatting.
export function ActivityList({
  entries,
}: {
  entries: Array<{ id: string; date: string; summary: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) {
    return <div className="text-[12px] text-ink-mute">No activity yet.</div>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
      >
        {entries.length} {entries.length === 1 ? "entry" : "entries"} · Show →
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-1 text-[12px]">
        {entries.map((a) => (
          <div key={a.id}>
            <span className="text-ink-mute">{a.date}</span> · {a.summary}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
      >
        Hide
      </button>
    </div>
  );
}

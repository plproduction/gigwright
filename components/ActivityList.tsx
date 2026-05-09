"use client";

import { useState } from "react";

// Compact activity feed for the gig detail page. Shows the 5 most recent
// entries by default and reveals the rest behind a "Show all" toggle, so
// gigs with dozens of payout-worksheet edits don't spike the page height.
//
// We accept a fully-rendered list of entries (already typed and formatted
// upstream) so this component stays presentational — the server page does
// the DB read and the date formatting.
export function ActivityList({
  entries,
}: {
  entries: Array<{ id: string; date: string; summary: string }>;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, 5);
  const hidden = entries.length - visible.length;

  if (entries.length === 0) {
    return <div className="text-[12px] text-ink-mute">No activity yet.</div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-1 text-[12px]">
        {visible.map((a) => (
          <div key={a.id}>
            <span className="text-ink-mute">{a.date}</span> · {a.summary}
          </div>
        ))}
      </div>
      {hidden > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
        >
          Show all {entries.length} →
        </button>
      )}
      {showAll && entries.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

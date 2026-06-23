"use client";

import { useState, useTransition } from "react";
import { setMyGuestList } from "@/lib/actions/my-guest-list";

// Per-gig guest list editor for the signed-in musician. Lives on
// /my-gigs/[id] in the same "your stuff for this gig" cluster as the
// mileage input. Auto-saves on blur, shows the running count of names
// so the musician knows what they've actually submitted, and shows
// per-name approval status badges so they can see which guests their
// bandleader has confirmed for the venue.
export function MyGuestListInput({
  gigId,
  musicianId,
  initialValue,
  approvedGuests,
}: {
  gigId: string;
  musicianId: string;
  initialValue: string | null;
  // The exact line strings the bandleader has approved (e.g. "Sarah
  // Smith +1"). Used to flip each line below the textarea between
  // Approved (green) and Pending (muted) badges.
  approvedGuests: string[];
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");
  const [pending, startTransition] = useTransition();

  // Parse the textarea into trimmed lines for both the count and the
  // per-name status list below. One line = one guest. We don't try to
  // be clever about "+1" — leave that to the bandleader's eyes.
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const lineCount = lines.length;
  const approvedSet = new Set(approvedGuests);
  const approvedCount = lines.filter((line) => approvedSet.has(line)).length;

  function persist() {
    if (value === saved) return;
    startTransition(async () => {
      await setMyGuestList(gigId, musicianId, value);
      setSaved(value);
    });
  }

  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          Your guest list
        </div>
        <div className="text-[10.5px] text-ink-mute tabular-nums">
          {pending
            ? "saving…"
            : value === saved
              ? lineCount === 0
                ? "0 guests"
                : `${approvedCount} / ${lineCount} approved`
              : "unsaved"}
        </div>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-mute">
        One name per line. Add &ldquo;+1&rdquo; or a note in parentheses if
        helpful. Your bandleader sees this list on their gig page and ticks
        names off as they confirm them for the venue.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={persist}
        disabled={pending}
        rows={4}
        placeholder={"Sarah Smith +1\nTom Jones (my brother)\nJenny Park"}
        className="mt-2 w-full resize-y rounded-md border border-line bg-paper-warm/40 px-3 py-2 text-[13px] leading-[1.55] text-ink outline-none focus:border-accent disabled:opacity-50"
      />

      {/* Per-name status. Only rendered when there's at least one name on
          the list — empty state would be busy noise. Names that match an
          entry in approvedGuests get a green "Approved" badge; the rest
          get a muted "Pending" badge so the musician sees the decision
          state without ambiguity. Updated server-side on every approval
          toggle the bandleader does, so a refresh shows the latest. */}
      {lineCount > 0 && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Status
          </div>
          <ul className="flex flex-col gap-1.5">
            {lines.map((line, i) => {
              const isApproved = approvedSet.has(line);
              return (
                <li
                  key={`${i}-${line}`}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-ink">{line}</span>
                  {isApproved ? (
                    <span className="shrink-0 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-success">
                      ✓ Approved
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-line-strong bg-paper-warm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                      Pending
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

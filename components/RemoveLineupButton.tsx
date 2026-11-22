"use client";

import { useState, useTransition } from "react";
import { removeAppliedLineup } from "@/lib/actions/roles";

// "Let's say I add the wrong lineup and I want to just take the lineup
// off" — Patrick, 2026-11-22.
//
// Applying a lineup seats a whole band in one click, which means picking
// the wrong one costs six manual deletions plus remembering that it also
// moved the client price. One click back, with a confirm that says
// exactly what will happen, because it removes people.
export function RemoveLineupButton({
  gigId,
  lineupName,
  playerCount,
}: {
  gigId: string;
  lineupName: string;
  playerCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-mute">
        <span>
          <span className="font-medium text-ink-soft">{lineupName}</span> seated{" "}
          {playerCount} {playerCount === 1 ? "player" : "players"} here.
        </span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-[26px] items-center rounded-full border border-line px-2.5 text-[11px] text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          Take this lineup off
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-[8px] border border-accent/40 bg-accent/5 px-3 py-2.5">
      <p className="text-[11.5px] leading-[1.5] text-ink-soft">
        Removes the {playerCount} {playerCount === 1 ? "player" : "players"} that{" "}
        <strong className="font-medium text-ink">{lineupName}</strong> added, and
        clears the client price if applying it is what set that. Anyone you added
        yourself stays, and anyone already marked paid stays.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await removeAppliedLineup(gigId);
              setConfirming(false);
            })
          }
          className="rounded-full bg-accent px-3 py-[5px] text-[11px] font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Removing…" : "Take it off"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-1 text-[11px] text-ink-mute hover:text-ink"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

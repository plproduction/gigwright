"use client";

import { useEffect, useState, useTransition } from "react";
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
  // "Just saved" pulse — green ✓ that fades out 2s after a successful
  // save so the musician sees an unambiguous confirmation without a
  // permanent indicator that would clutter the header.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

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
      setJustSaved(true);
    });
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-paper shadow-[0_1px_2px_rgba(14,12,9,0.04)]">
      {/* ── Header ─────────────────────────────────────────────────────
          Single-line eyebrow with a save-state indicator on the right.
          Three states the musician will see, each unambiguous:
            "Saving…"     while a server action is in flight
            "✓ Saved"     for 2s after a successful save
            "Auto-saved"  steady state when nothing is pending
          Never shows the word "unsaved" — that's alarming language for
          a system that's literally auto-saving on click-out. */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-warm/40 px-5 py-3.5">
        <h6 className="font-serif text-[15px] font-normal tracking-tight text-ink">
          Your guest list
        </h6>
        <div className="text-[11px] font-medium tabular-nums">
          {pending ? (
            <span className="italic text-ink-mute">Saving…</span>
          ) : justSaved ? (
            <span className="text-success">✓ Saved</span>
          ) : lineCount === 0 ? (
            <span className="italic text-ink-mute">Auto-saved</span>
          ) : (
            <span className="text-ink-soft">
              <span className="font-semibold text-success">
                {approvedCount}
              </span>{" "}
              of {lineCount} confirmed
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-[12.5px] leading-[1.5] text-ink-soft">
          One name per line. Each guest turns{" "}
          <em className="not-italic font-medium text-success">green</em> once
          your bandleader confirms it for the venue.
        </p>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={persist}
          disabled={pending}
          rows={lineCount > 0 ? Math.min(Math.max(lineCount + 1, 3), 8) : 4}
          placeholder={"Sarah Smith +1\nTom Jones (my brother)\nJenny Park"}
          className="w-full resize-y rounded-[8px] border border-line bg-paper-warm/30 px-3.5 py-3 font-serif text-[14px] leading-[1.7] text-ink outline-none transition-colors focus:border-accent/50 focus:bg-paper disabled:opacity-50"
        />

        {/* ── Status list ──────────────────────────────────────────────
            One row per name with hospitality-grade visual rhythm: small
            mark in the gutter (filled gold dot for confirmed, open ring
            for awaiting), name in Georgia at 14.5px, status word at
            right in italic. Approved rows get a whisper of cream-gold
            background tint so the eye picks them up at a glance
            without the row turning into a green hazmat sticker. */}
        {lineCount > 0 && (
          <div className="mt-5">
            <div className="mb-2.5 flex items-baseline gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                Status
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-line via-line to-transparent" />
            </div>
            <ul className="flex flex-col">
              {lines.map((line, i) => {
                const isApproved = approvedSet.has(line);
                return (
                  <li
                    key={`${i}-${line}`}
                    className={`group flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${
                      isApproved
                        ? "bg-gold/[0.06] hover:bg-gold/[0.10]"
                        : "hover:bg-paper-warm/60"
                    }`}
                  >
                    {/* Status mark — filled gold dot when confirmed,
                        open ring when awaiting. Tiny but readable. */}
                    {isApproved ? (
                      <span
                        aria-hidden
                        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-gold shadow-[0_0_0_2px_rgba(168,139,74,0.18)]"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-line-strong bg-paper"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-serif text-[14.5px] leading-tight text-ink">
                      {line}
                    </span>
                    {isApproved ? (
                      <span className="shrink-0 font-serif text-[12px] italic tracking-tight text-success">
                        Confirmed
                      </span>
                    ) : (
                      <span className="shrink-0 font-serif text-[12px] italic tracking-tight text-ink-mute">
                        Awaiting
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

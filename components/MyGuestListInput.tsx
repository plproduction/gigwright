"use client";

import { useState, useTransition } from "react";
import { setMyGuestList } from "@/lib/actions/my-guest-list";

// Per-gig guest list editor for the signed-in musician. Lives on
// /my-gigs/[id] in the same "your stuff for this gig" cluster as the
// mileage input. Auto-saves on blur, shows the running count of names
// so the musician knows what they've actually submitted, and tells
// them where it lands ("Patrick sees this on his gig page").
export function MyGuestListInput({
  gigId,
  musicianId,
  initialValue,
}: {
  gigId: string;
  musicianId: string;
  initialValue: string | null;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");
  const [pending, startTransition] = useTransition();

  // Count non-empty lines. Used in the helper line so the musician sees
  // their list is being parsed the way they expect — one line = one
  // guest. Doesn't try to be clever about "+1" — leave that to the
  // bandleader's eyes.
  const lineCount = value
    .split("\n")
    .filter((line) => line.trim() !== "").length;

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
              ? `${lineCount} ${lineCount === 1 ? "guest" : "guests"}`
              : "unsaved"}
        </div>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-mute">
        One name per line. Add &ldquo;+1&rdquo; or a note in parentheses if
        helpful. The bandleader sees a consolidated list of everyone&rsquo;s
        guests on the gig page.
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
    </div>
  );
}

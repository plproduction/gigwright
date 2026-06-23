"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setLeaderGuestList } from "@/lib/actions/leader-guest-list";

// Bandleader's own guest list editor for a specific gig. Same row-based
// shape as MyGuestListInput (so the visual language stays consistent
// across the app), but every name is auto-approved as it's added —
// the leader is the approver, so making them check a box for their
// own guests is silly. They CAN still untick a name from the main
// consolidated list if they change their mind; that goes through the
// regular toggleGuestApproval action.
export function LeaderGuestListInput({
  gigId,
  initialValue,
}: {
  gigId: string;
  initialValue: string | null;
}) {
  const parseLines = (raw: string | null): string[] =>
    (raw ?? "")
      .split("\n")
      .map((s) => s.trimEnd())
      .filter((s) => s.trim() !== "");

  const initialNames = parseLines(initialValue);
  const [names, setNames] = useState<string[]>(
    initialNames.length > 0 ? initialNames : [""],
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string>(
    initialNames.join("\n"),
  );
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    if (focusIndex !== null) {
      inputRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, names.length]);

  const nonEmpty = names.filter((n) => n.trim() !== "");
  const lineCount = nonEmpty.length;

  function persistIfChanged(nextNames?: string[]) {
    const source = nextNames ?? names;
    const cleaned = source.map((n) => n.trim()).filter((n) => n !== "");
    const nextStr = cleaned.join("\n");
    if (nextStr === savedSnapshot) return;
    startTransition(async () => {
      await setLeaderGuestList(gigId, nextStr);
      setSavedSnapshot(nextStr);
      setJustSaved(true);
    });
  }

  function updateName(i: number, value: string) {
    const next = [...names];
    next[i] = value;
    setNames(next);
  }

  function removeName(i: number) {
    const next = names.filter((_, idx) => idx !== i);
    const ensured = next.length === 0 ? [""] : next;
    setNames(ensured);
    persistIfChanged(ensured);
  }

  function addRow() {
    setNames([...names, ""]);
    setFocusIndex(names.length);
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-paper shadow-[0_1px_2px_rgba(14,12,9,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-warm/40 px-3.5 py-2.5">
        <h6 className="font-serif text-[13.5px] font-normal tracking-tight text-ink">
          Your guests
        </h6>
        <div className="text-[10.5px] font-medium tabular-nums">
          {pending ? (
            <span className="italic text-ink-mute">Saving…</span>
          ) : justSaved ? (
            <span className="text-success">✓ Saved</span>
          ) : lineCount === 0 ? (
            <span className="italic text-ink-mute">Auto-saved</span>
          ) : (
            <span className="text-success font-semibold">
              {lineCount} confirmed
            </span>
          )}
        </div>
      </div>

      <div className="px-3.5 py-3">
        <p className="mb-3 text-[11.5px] leading-[1.5] text-ink-soft">
          Your own guests for this gig. They&rsquo;re{" "}
          <span className="font-medium text-success">
            auto-confirmed
          </span>{" "}
          since you&rsquo;re the approver — you can still untick any name
          on the main list below if you change your mind.
        </p>

        <ul className="flex flex-col">
          {names.map((name, i) => {
            const trimmed = name.trim();
            const hasName = trimmed !== "";
            return (
              <li key={i}>
                <div className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-gold/[0.08]">
                  {/* Leader's rows always show the filled-gold-dot since
                      everything they type is auto-approved. */}
                  <span
                    aria-hidden
                    className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${
                      hasName
                        ? "bg-gold shadow-[0_0_0_2px_rgba(168,139,74,0.18)]"
                        : "border border-line-strong bg-paper"
                    }`}
                  />
                  <input
                    type="text"
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    value={name}
                    onChange={(e) => updateName(i, e.target.value)}
                    onBlur={() => persistIfChanged()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                        addRow();
                      }
                    }}
                    placeholder="Type a guest name…"
                    className="min-w-0 flex-1 bg-transparent font-serif text-[13.5px] leading-tight text-ink placeholder:italic placeholder:text-ink-mute focus:outline-none"
                  />
                  {hasName && (
                    <span className="shrink-0 font-serif text-[11px] italic tracking-tight text-success">
                      Confirmed
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeName(i)}
                    disabled={names.length === 1 && trimmed === ""}
                    aria-label="Remove guest"
                    title="Remove this guest"
                    className="shrink-0 text-[14px] leading-none text-ink-mute opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 focus:opacity-100 disabled:cursor-default disabled:hover:text-ink-mute"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={addRow}
          className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent underline-offset-4 hover:underline decoration-accent/40"
        >
          + Add another
        </button>
      </div>
    </div>
  );
}

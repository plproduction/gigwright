"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setMyGuestList } from "@/lib/actions/my-guest-list";

// Per-gig guest list editor for the musician. One single list — each
// guest is a row with an open ring or gold dot in the gutter, the
// name in Georgia serif, and "Pending" or "Confirmed" in italic on
// the right. Same pattern as the bandleader's contractor / personnel
// rows on the gig page, just without the roster typeahead because
// guests are people who aren't in any roster.
//
// DB representation hasn't changed: names join with \n into
// GigPersonnel.guestList so the bandleader's approval flow (which
// keys on the literal line string) still works as-is.
export function MyGuestListInput({
  gigId,
  musicianId,
  initialValue,
  approvedGuests,
}: {
  gigId: string;
  musicianId: string;
  initialValue: string | null;
  approvedGuests: string[];
}) {
  const parseLines = (raw: string | null): string[] =>
    (raw ?? "")
      .split("\n")
      .map((s) => s.trimEnd())
      .filter((s) => s.trim() !== "");

  // Start with at least one empty row so the user sees an inviting place
  // to type instead of an empty area with just an "Add guest" link.
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

  const approvedSet = new Set(approvedGuests);
  const nonEmpty = names.filter((n) => n.trim() !== "");
  const lineCount = nonEmpty.length;
  const approvedCount = nonEmpty.filter((n) =>
    approvedSet.has(n.trim()),
  ).length;

  function persistIfChanged(nextNames?: string[]) {
    const source = nextNames ?? names;
    const cleaned = source.map((n) => n.trim()).filter((n) => n !== "");
    const nextStr = cleaned.join("\n");
    if (nextStr === savedSnapshot) return;
    startTransition(async () => {
      await setMyGuestList(gigId, musicianId, nextStr);
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
    // Always keep at least one row so the user has a place to type
    const ensured = next.length === 0 ? [""] : next;
    setNames(ensured);
    persistIfChanged(ensured);
  }

  function addRow() {
    setNames([...names, ""]);
    setFocusIndex(names.length);
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-paper shadow-[0_1px_2px_rgba(14,12,9,0.04)]">
      {/* ── Header — eyebrow + save-state indicator ─────────────────── */}
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
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-soft">
          Kindly provide one guest name per line, using parentheses for any
          accompaniments (+1) or special notes. Our team will review your
          requests shortly, updating the status below from{" "}
          <em className="not-italic font-medium text-ink-soft">Pending</em> to{" "}
          <em className="not-italic font-medium text-success">Confirmed</em>{" "}
          upon approval.
        </p>

        {/* ── The single list ──────────────────────────────────────────
            Each guest row: gold dot (confirmed) or open ring (pending)
            in the left gutter, name input in Georgia serif at 14.5px,
            italic "Pending" or "Confirmed" on the right. The whole row
            is one editable input — no separate textarea, no separate
            read-only status list. Enter at the end of a row commits
            and opens a fresh empty row right below. */}
        <ul className="flex flex-col">
          {names.map((name, i) => {
            const trimmed = name.trim();
            const isApproved =
              trimmed !== "" && approvedSet.has(trimmed);
            return (
              <li key={i}>
                <div
                  className={`group flex items-center gap-3 rounded-md px-1.5 py-2 transition-colors ${
                    isApproved
                      ? "bg-gold/[0.05] hover:bg-gold/[0.10]"
                      : "hover:bg-paper-warm/50"
                  }`}
                >
                  {/* Status mark in the gutter — same visual vocabulary
                      as the bottom Status list Patrick liked. Solid gold
                      dot when confirmed, open ring otherwise. */}
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
                    className="min-w-0 flex-1 bg-transparent font-serif text-[14.5px] leading-tight text-ink placeholder:italic placeholder:text-ink-mute focus:outline-none"
                  />
                  {trimmed !== "" &&
                    (isApproved ? (
                      <span className="shrink-0 font-serif text-[12.5px] italic tracking-tight text-success">
                        Confirmed
                      </span>
                    ) : (
                      <span className="shrink-0 font-serif text-[12.5px] italic tracking-tight text-ink-mute">
                        Pending
                      </span>
                    ))}
                  {/* Remove control — quiet ✕, only appears on hover so
                      a calm row stays calm. Disabled when this is the
                      last empty placeholder row. */}
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

        {/* Add row — small accent link, never a heavy button. */}
        <button
          type="button"
          onClick={addRow}
          className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent underline-offset-4 hover:underline decoration-accent/40"
        >
          + Add another guest
        </button>
      </div>
    </div>
  );
}

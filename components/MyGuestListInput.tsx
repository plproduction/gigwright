"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setMyGuestList } from "@/lib/actions/my-guest-list";

// Per-gig guest list editor for the signed-in musician. One row per
// guest — an editable name field with a status pill (Pending / Confirmed)
// to the right. Same row-based pattern the bandleader uses when adding
// personnel to a gig, so the visual language stays consistent across
// the app. Auto-saves the full list on any blur; empty rows don't
// persist. New rows are added by pressing Enter at the end of a line
// or by clicking the discreet "Add guest" link at the bottom.
//
// Internally the DB still stores the list as a newline-joined string in
// GigPersonnel.guestList, so approvals (which key on the literal line
// string) keep working without a schema change.
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

  const [names, setNames] = useState<string[]>(() => parseLines(initialValue));
  const [savedSnapshot, setSavedSnapshot] = useState<string>(
    parseLines(initialValue).join("\n"),
  );
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  // Track which input to autofocus after an add-row click.
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
  const approvedCount = nonEmpty.filter((n) => approvedSet.has(n.trim()))
    .length;

  function persistIfChanged() {
    const next = names.map((n) => n.trim()).filter((n) => n !== "");
    const nextStr = next.join("\n");
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
    setNames(next);
    // Save the removal immediately rather than waiting for a blur on
    // the (now-gone) row.
    const trimmed = next.map((n) => n.trim()).filter((n) => n !== "");
    const nextStr = trimmed.join("\n");
    if (nextStr !== savedSnapshot) {
      startTransition(async () => {
        await setMyGuestList(gigId, musicianId, nextStr);
        setSavedSnapshot(nextStr);
        setJustSaved(true);
      });
    }
  }

  function addRow() {
    setNames([...names, ""]);
    setFocusIndex(names.length);
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-paper shadow-[0_1px_2px_rgba(14,12,9,0.04)]">
      {/* ── Header — eyebrow + save-state indicator on the right ───── */}
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
        {/* Hospitality copy — Patrick's preferred wording verbatim. */}
        <p className="mb-4 text-[12.5px] leading-[1.55] text-ink-soft">
          Kindly provide one guest name per line, using parentheses for any
          accompaniments (+1) or special notes. Our team will review your
          requests shortly, updating the status below from{" "}
          <em className="not-italic font-medium text-ink-soft">Pending</em> to{" "}
          <em className="not-italic font-medium text-success">Confirmed</em>{" "}
          upon approval.
        </p>

        {/* ── Rows ─────────────────────────────────────────────────────
            Each guest is a single row: name field on the left, status
            pill on the right, tiny ✕ remove control that only appears on
            hover so the resting state stays calm. Empty rows render the
            same way so the user can type into them; we just don't show
            a status pill for an empty name (nothing to confirm). */}
        <ul className="flex flex-col">
          {names.length === 0 ? (
            <li>
              <div className="flex items-center gap-3 border-b border-line py-2.5">
                <input
                  type="text"
                  ref={(el) => {
                    inputRefs.current[0] = el;
                  }}
                  value=""
                  onChange={(e) => {
                    setNames([e.target.value]);
                  }}
                  onBlur={persistIfChanged}
                  placeholder="Type a guest name…"
                  className="min-w-0 flex-1 bg-transparent font-serif text-[14.5px] leading-tight text-ink placeholder:italic placeholder:text-ink-mute focus:outline-none"
                />
              </div>
            </li>
          ) : (
            names.map((name, i) => {
              const trimmed = name.trim();
              const isApproved =
                trimmed !== "" && approvedSet.has(trimmed);
              return (
                <li key={i}>
                  <div className="group flex items-center gap-3 border-b border-line py-2.5 transition-colors hover:bg-paper-warm/30">
                    <input
                      type="text"
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      value={name}
                      onChange={(e) => updateName(i, e.target.value)}
                      onBlur={persistIfChanged}
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
                        <span className="shrink-0 rounded-full border border-success/35 bg-success/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
                          ✓ Confirmed
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-line-strong bg-paper-warm px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Pending
                        </span>
                      ))}
                    <button
                      type="button"
                      onClick={() => removeName(i)}
                      aria-label="Remove guest"
                      title="Remove this guest"
                      className="shrink-0 text-[14px] leading-none text-ink-mute opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {/* Add row — discreet small accent-link rather than a button so
            it sits quietly under the list. */}
        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent underline-offset-4 hover:underline decoration-accent/40"
        >
          + Add guest
        </button>
      </div>
    </div>
  );
}

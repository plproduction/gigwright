"use client";

import { useState, useTransition } from "react";
import { setMyMileage } from "@/lib/actions/my-mileage";
import { STANDARD_MILEAGE_RATE_USD } from "@/lib/mileage-rate";

// Tiny "Miles: ___" input that lives on each musician-facing gig row.
// Persists on blur. Shows the IRS deductible value as a quiet hint so
// the musician sees "180 mi × $0.67 = $120.60 deductible" in real time —
// makes the tax-prep value of logging the number tangible right at the
// moment of entry, instead of waiting until year-end to find out it
// mattered.
export function MyMileageInput({
  gigId,
  musicianId,
  initialMiles,
}: {
  gigId: string;
  musicianId: string;
  initialMiles: number | null;
}) {
  const [miles, setMiles] = useState<string>(
    initialMiles != null ? String(initialMiles) : "",
  );
  const [saved, setSaved] = useState<number | null>(initialMiles);
  const [pending, startTransition] = useTransition();

  function persist() {
    const trimmed = miles.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next === saved) return;
    if (next !== null && (Number.isNaN(next) || next < 0)) {
      // Snap back to last saved on invalid input.
      setMiles(saved != null ? String(saved) : "");
      return;
    }
    startTransition(async () => {
      await setMyMileage(gigId, musicianId, next);
      setSaved(next);
    });
  }

  const numeric = miles.trim() === "" ? null : Number(miles);
  const deductible =
    numeric != null && !Number.isNaN(numeric) && numeric > 0
      ? (numeric * STANDARD_MILEAGE_RATE_USD).toFixed(2)
      : null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-soft">
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-mute">
          Miles
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={miles}
          onChange={(e) => setMiles(e.target.value)}
          onBlur={persist}
          disabled={pending}
          placeholder="0"
          min={0}
          className="w-[64px] rounded border border-line bg-paper px-1.5 py-0.5 text-right text-[12px] tabular-nums text-ink outline-none focus:border-accent disabled:opacity-50"
        />
      </label>
      {deductible ? (
        <span
          className="tabular-nums text-ink-mute"
          title={`${numeric} mi × $${STANDARD_MILEAGE_RATE_USD.toFixed(2)} IRS standard rate`}
        >
          ≈ ${deductible} deductible
        </span>
      ) : (
        <span className="text-ink-mute/70">round trip — for your taxes</span>
      )}
      {pending && (
        <span className="text-[10px] italic text-ink-mute">saving…</span>
      )}
    </div>
  );
}

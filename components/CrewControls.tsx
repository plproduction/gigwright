"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadCrewIntoGig, saveCurrentGigAsCrew } from "@/lib/actions/gigs";

// Twin buttons that sit at the bottom of the gig edit page's personnel
// section: "⭐ Load My Crew" (adds every Crew member to this gig,
// skipping anyone already assigned) and "Save this lineup as My Crew"
// (snapshots the current personnel list as the bandleader's default
// Crew). Save-as-Crew confirms first because it OVERWRITES the entire
// existing Crew — a stray click could wipe out weeks of Crew curation.
//
// Both call server actions via useTransition so the buttons disable
// while pending — no double-click duplication.
export function CrewControls({
  gigId,
  personnelCount,
  currentCrewCount,
}: {
  gigId: string;
  personnelCount: number;
  currentCrewCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function loadCrew() {
    startTransition(async () => {
      const res = await loadCrewIntoGig(gigId);
      router.refresh();
      if (res.added === 0) {
        alert(
          currentCrewCount === 0
            ? "You haven't saved a Crew yet. Add the musicians you want in your default lineup, then click 'Save this lineup as My Crew'."
            : "All Crew members are already on this gig.",
        );
      }
    });
  }

  function saveAsCrew() {
    if (personnelCount === 0) {
      alert("Add at least one musician to the gig before saving as Crew.");
      return;
    }
    const msg =
      currentCrewCount === 0
        ? `Save this lineup (${personnelCount} musician${personnelCount === 1 ? "" : "s"}) as your default My Crew? Future new gigs will pre-populate with them.`
        : `This will REPLACE your current My Crew (${currentCrewCount} musician${currentCrewCount === 1 ? "" : "s"}) with the ${personnelCount} musician${personnelCount === 1 ? "" : "s"} currently on this gig. Continue?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await saveCurrentGigAsCrew(gigId);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-line-strong bg-paper-warm/40 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        My Crew
      </div>
      <button
        type="button"
        onClick={loadCrew}
        disabled={pending}
        className="rounded border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        title="Add every Crew member to this gig, skipping anyone already assigned"
      >
        {pending ? "…" : "⭐ Load My Crew"}
      </button>
      <button
        type="button"
        onClick={saveAsCrew}
        disabled={pending}
        className="rounded border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        title="Snapshot this lineup as your default My Crew — future new gigs will pre-populate with these musicians"
      >
        {pending ? "…" : "Save this lineup as My Crew"}
      </button>
      {currentCrewCount > 0 && (
        <span className="text-[11px] text-ink-mute">
          Current Crew: {currentCrewCount}
        </span>
      )}
    </div>
  );
}

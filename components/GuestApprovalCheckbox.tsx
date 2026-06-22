"use client";

import { useState, useTransition } from "react";
import { toggleGuestApproval } from "@/lib/actions/guest-approval";

// Single-name approval checkbox for the bandleader's guest-list view.
// Optimistic — the checkbox flips immediately on click and revalidates
// in the background. If the server rejects, we snap back to the
// previous state so the UI doesn't claim a name is approved when it
// isn't. Saves one server round-trip's worth of perceived latency
// across many quick approvals.
export function GuestApprovalCheckbox({
  personnelId,
  name,
  initialApproved,
}: {
  personnelId: string;
  name: string;
  initialApproved: boolean;
}) {
  const [approved, setApproved] = useState(initialApproved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !approved;
    setApproved(next); // optimistic
    startTransition(async () => {
      try {
        await toggleGuestApproval(personnelId, name, next);
      } catch {
        setApproved(!next); // revert on failure
      }
    });
  }

  return (
    <label
      className="flex cursor-pointer items-center gap-2"
      title={
        approved
          ? "Approved — uncheck to remove from the venue list"
          : "Not approved yet — check to confirm this guest is on the list"
      }
    >
      <input
        type="checkbox"
        checked={approved}
        onChange={toggle}
        disabled={pending}
        className="h-3.5 w-3.5 accent-[#7E2418]"
      />
      <span
        className={
          approved
            ? "text-[13px] font-medium text-success"
            : "text-[13px] text-ink"
        }
      >
        {name}
      </span>
    </label>
  );
}

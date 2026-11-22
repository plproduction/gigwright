"use client";

import { useState, useTransition } from "react";
import { deleteRole } from "@/lib/actions/roles";

// Deleting a role is the most destructive button on the Band page and
// used to be a bare 11px "Delete" that fired on the first click, sitting
// 6px from the role-order arrows.
//
// It is worse than it looks: LineupRole.role is onDelete: Cascade, so
// removing "Keyboards" also pulls the keyboard chair out of every lineup
// that sells one — the Six Piece quietly becomes a five piece and its
// band cost drops. GigPersonnel.role is onDelete: SetNull, so people
// already booked keep their row but lose the structured role. None of
// that is guessable from a one-word button, so the confirm says it.
export function DeleteRoleButton({
  roleId,
  roleName,
  memberCount,
}: {
  roleId: string;
  roleName: string;
  memberCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete the ${roleName} role`}
        className="inline-flex h-[26px] items-center rounded px-2 text-[11px] text-ink-mute transition-colors hover:bg-accent/10 hover:text-accent"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-2 py-1">
      <span className="text-[10.5px] leading-tight text-ink-soft">
        Delete <strong className="font-medium text-ink">{roleName}</strong>?
        {memberCount > 0 && ` Drops ${memberCount} from its call list`}
        {memberCount > 0 ? " and removes" : " Removes"} the chair from any
        lineup that uses it.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteRole(roleId).then(() => {}))}
        className="shrink-0 rounded-full bg-accent px-2 py-[3px] text-[10px] font-medium text-paper disabled:opacity-60"
      >
        {pending ? "…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="shrink-0 px-1 text-[10px] text-ink-mute hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}

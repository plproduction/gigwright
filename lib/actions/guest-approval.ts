"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Toggle a single guest's approval on a GigPersonnel row. Called from
// the bandleader's gig detail page when they tick/untick the checkbox
// next to a guest name. Authorization: must be the gig's owner (the
// bandleader). Musicians never call this — their input writes to
// guestList instead, which the bandleader sees and selectively
// approves from.
//
// The `name` is the exact line string the musician typed
// ("Sarah Smith +1"). Storing the literal string (rather than an
// index into guestList) keeps approvals attached to actual names
// even when the musician edits unrelated lines.
export async function toggleGuestApproval(
  personnelId: string,
  name: string,
  approved: boolean,
) {
  const user = await requireUser();

  // Confirm the bandleader owns the gig this personnel row belongs to.
  const personnel = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
    select: { id: true, gigId: true, approvedGuests: true },
  });
  if (!personnel) {
    throw new Error("Not your gig");
  }

  const trimmed = name.trim();
  if (trimmed === "") return;

  const current = new Set(personnel.approvedGuests);
  if (approved) {
    current.add(trimmed);
  } else {
    current.delete(trimmed);
  }

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: { approvedGuests: Array.from(current) },
  });

  revalidatePath(`/gigs/${personnel.gigId}`);
}

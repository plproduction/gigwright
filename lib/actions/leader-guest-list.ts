"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Bandleader's own guest list for a gig. Different from setMyGuestList
// (the musician self-service action) in one key way: every name the
// leader types is auto-added to approvedGuests on the same row, so the
// leader doesn't have to type a name in one place and then check a
// box for it somewhere else. The leader can still uncheck a name via
// the same approval checkbox UI used for everyone else — auto-approve
// is a sensible default, not a lock.
//
// Authorization: requireUser, plus the gig must be owned by the
// signed-in user. The musician approach (musician must be on the
// gig's personnel) doesn't apply here — we look up the leader's own
// personnel row directly from their isLeader flag.
export async function setLeaderGuestList(gigId: string, guestList: string) {
  const user = await requireUser();

  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
    select: { id: true },
  });
  if (!gig) {
    throw new Error("Not your gig");
  }

  // Find the leader's personnel row on this gig. The leader is the
  // Musician owned by this user where isLeader=true. They may not
  // be on every gig (e.g. a contracting/managing gig the leader
  // booked but isn't playing), so personnel can legitimately be
  // null — we surface that as an explicit error.
  const personnel = await db.gigPersonnel.findFirst({
    where: {
      gigId,
      musician: { ownerId: user.id, isLeader: true },
    },
    select: { id: true },
  });
  if (!personnel) {
    throw new Error(
      "Add yourself to this gig's personnel before setting your guest list",
    );
  }

  const trimmed = guestList.trim();
  const names =
    trimmed === ""
      ? []
      : trimmed
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s !== "");

  await db.gigPersonnel.update({
    where: { id: personnel.id },
    data: {
      guestList: trimmed === "" ? null : trimmed,
      // Auto-approve every name the leader adds. Leader can still
      // uncheck any name via the approval checkbox if they want to
      // toggle it back to Pending.
      approvedGuests: names,
      guestListUpdatedAt: new Date(),
    },
  });

  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/my-gigs/${gigId}`);
}

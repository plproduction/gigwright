"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";

// Update the signed-in musician's guest list for a specific gig.
// Same authorization shape as setMyMileage: caller must own the
// musicianId (via userId link) AND that musicianId must actually be
// on the gig's personnel. Both guard against someone editing a guest
// list for a gig they aren't booked on.
export async function setMyGuestList(
  gigId: string,
  musicianId: string,
  guestList: string,
) {
  const user = await requireMusician();

  const owned = await db.musician.findFirst({
    where: { id: musicianId, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("Not your musician profile");
  }

  // GigPersonnel is unique on (gigId, musicianId). We find the row and
  // update its guestList in place. If the musician isn't on the gig we
  // surface that as an error instead of silently no-op'ing.
  const personnel = await db.gigPersonnel.findUnique({
    where: { gigId_musicianId: { gigId, musicianId } },
    select: { id: true },
  });
  if (!personnel) {
    throw new Error("You're not on this gig");
  }

  const trimmed = guestList.trim();
  await db.gigPersonnel.update({
    where: { id: personnel.id },
    data: {
      guestList: trimmed === "" ? null : trimmed,
      guestListUpdatedAt: new Date(),
    },
  });

  revalidatePath(`/my-gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}`); // bandleader's consolidated view
}

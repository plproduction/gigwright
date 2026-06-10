"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";

// Upsert a musician's mileage for a single gig. Miles is round-trip — most
// working musicians drive home after the gig and that's what their logbook
// records. The action validates the caller is actually on this gig (via
// requireMusician's userId → Musician link) so a musician can't log miles
// against a gig they weren't booked on.
export async function setMyMileage(
  gigId: string,
  musicianId: string,
  miles: number | null,
) {
  const user = await requireMusician();

  // Confirm this musicianId belongs to the signed-in user. Musicians can
  // have multiple roster links across bandleaders, so we accept any one
  // they're tied to — but never one they're not.
  const owned = await db.musician.findFirst({
    where: { id: musicianId, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("Not your musician profile");
  }

  // Confirm this musician is actually on the gig. Otherwise someone could
  // log mileage against a stranger's gig just because the URL knew the gigId.
  const onGig = await db.gigPersonnel.findFirst({
    where: { gigId, musicianId },
    select: { id: true },
  });
  if (!onGig) {
    throw new Error("You're not on this gig");
  }

  if (miles === null || miles <= 0) {
    // Clear by deleting the row. Keeps the table small and the
    // year-end CSV doesn't show $0 line items.
    await db.musicianGigMileage.deleteMany({
      where: { gigId, musicianId },
    });
  } else {
    await db.musicianGigMileage.upsert({
      where: { musicianId_gigId: { musicianId, gigId } },
      create: { musicianId, gigId, miles: Math.round(miles) },
      update: { miles: Math.round(miles) },
    });
  }

  revalidatePath("/my-gigs");
  revalidatePath("/my-tax");
}

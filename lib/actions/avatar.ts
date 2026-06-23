"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Persist a freshly-uploaded avatar URL onto a Musician row. Called by
// AvatarUpload directly after @vercel/blob/client.upload() returns,
// instead of relying on Vercel Blob's onUploadCompleted webhook. The
// webhook approach was failing silently in our Netlify deploy — the
// callback from Vercel's infra has no session cookie and was bouncing
// at the auth gate (or just not reaching us at all), so the photo
// rendered locally but the DB column stayed null → photo gone on
// next reload.
//
// Authorization: bandleader owns the Musician row, OR musician is
// editing their own profile (linked via userId). Same OR shape used
// by the avatar route's token check.
export async function setMyAvatarUrl(musicianId: string, url: string) {
  const user = await requireUser();
  console.log(
    `[setMyAvatarUrl] userId=${user.id} musicianId=${musicianId} urlLen=${url.length}`,
  );

  const musician = await db.musician.findFirst({
    where: {
      id: musicianId,
      OR: [{ ownerId: user.id }, { userId: user.id }],
    },
    select: { id: true, ownerId: true, userId: true },
  });
  if (!musician) {
    console.error(
      `[setMyAvatarUrl] FAILED — no musician match. userId=${user.id} requestedMusicianId=${musicianId}`,
    );
    throw new Error("Not your musician profile");
  }

  await db.musician.update({
    where: { id: musician.id },
    data: { avatarUrl: url },
  });
  console.log(
    `[setMyAvatarUrl] ok musicianId=${musician.id} ownerId=${musician.ownerId} linkedUserId=${musician.userId}`,
  );

  revalidatePath("/my-profile");
  revalidatePath(`/roster/${musicianId}/edit`);
  revalidatePath("/roster");
}

// Clear the avatar — sets avatarUrl back to null. Same auth rules as
// setMyAvatarUrl. Used by the "Remove photo" affordance (if/when added).
export async function clearMyAvatarUrl(musicianId: string) {
  const user = await requireUser();

  const musician = await db.musician.findFirst({
    where: {
      id: musicianId,
      OR: [{ ownerId: user.id }, { userId: user.id }],
    },
    select: { id: true },
  });
  if (!musician) {
    throw new Error("Not your musician profile");
  }

  await db.musician.update({
    where: { id: musician.id },
    data: { avatarUrl: null },
  });

  revalidatePath("/my-profile");
  revalidatePath(`/roster/${musicianId}/edit`);
  revalidatePath("/roster");
}

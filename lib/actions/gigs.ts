"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCanAdd, requirePro } from "@/lib/plan";

type GigStatus = "INQUIRY" | "HOLD" | "CONFIRMED" | "PLAYED" | "CANCELLED";

export async function upsertGig(id: string | null, formData: FormData) {
  const user = await requireUser();

  // FREE plan caps active gigs at FREE_LIMITS.activeGigs. Edits of
  // existing gigs are always allowed; only *new* rows are gated.
  // "Active" excludes CANCELLED. PLAYED still counts, by design —
  // the gig roster is the user's working data, not a future-only
  // calendar.
  if (!id) {
    await assertCanAdd(user, "activeGigs");
  }

  // The form gives us a local date + individual time fields. We combine them
  // into DateTime values below. All gig times share the same calendar date.
  const dateStr = String(formData.get("date") ?? "").trim();
  if (!dateStr) throw new Error("Date is required");

  // Downbeat time is optional now — Patrick wanted to be able to drop
  // in just a name + date for placeholder gigs (e.g., "Debbie's Wedding
  // — Aug 22") without committing to a downbeat until the details come
  // in. Blank time defaults to 8pm, which is a plausible default for
  // most working gigs and easy to spot as "not yet set" on the sheet.
  const startTime = String(formData.get("startTime") ?? "").trim() || "20:00";
  const startAt = combineDateTime(dateStr, startTime);
  const loadInAt = combineOptionalTime(dateStr, formData.get("loadInTime"));
  const soundcheckAt = combineOptionalTime(dateStr, formData.get("soundcheckTime"));
  const soundcheckEndAt = combineOptionalTime(dateStr, formData.get("soundcheckEndTime"));
  const callTimeAt = combineOptionalTime(dateStr, formData.get("callTime"));
  const endAt = combineOptionalTime(dateStr, formData.get("endTime"));
  // Second show (optional). Both fields can stay null for a single-show gig.
  const secondStartAt = combineOptionalTime(dateStr, formData.get("secondStartTime"));
  const secondEndAt = combineOptionalTime(dateStr, formData.get("secondEndTime"));

  const clientPayCents = parseMoneyToCents(formData.get("clientPay"));
  const clientDepositCents = parseMoneyToCents(formData.get("clientDeposit"));

  // IMPORTANT: only fields the GigForm actually exposes belong in this
  // payload. materialsUrl, setlistUrl, setlistFileName, loadingInfo,
  // loadingMapUrl, loadingMapLink, soundContactName, and soundContactPhone
  // are managed via separate flows (InlineField on the detail page and
  // the SetlistUpload / LoadingMapUpload routes). Including them here would
  // silently null them out every time the user saves the form, since the
  // form has no inputs for them — that's the "set list disappears after I
  // edit something else" bug.
  const data = {
    venueId: nullIfEmpty(formData.get("venueId")),
    eventName: nullIfEmpty(formData.get("eventName")),
    startAt,
    loadInAt,
    soundcheckAt,
    soundcheckEndAt,
    callTimeAt,
    endAt,
    secondStartAt,
    secondEndAt,
    status: String(formData.get("status") ?? "CONFIRMED") as GigStatus,
    clientPayCents,
    clientDepositCents,
    sound: nullIfEmpty(formData.get("sound")),
    lights: nullIfEmpty(formData.get("lights")),
    attire: nullIfEmpty(formData.get("attire")),
    meal: nullIfEmpty(formData.get("meal")),
    notes: nullIfEmpty(formData.get("notes")),
    guestListCap: (() => {
      const raw = formData.get("guestListCap");
      if (raw == null) return null;
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.min(Math.max(Math.floor(n), 1), 50);
    })(),
  };

  if (id) {
    const before = await db.gig.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!before) throw new Error("Gig not found");

    const updated = await db.gig.update({
      where: { id, ownerId: user.id },
      data,
    });

    // Track what changed for the activity feed (foundation for diff-aware
    // notifications once SMS/email sends are live).
    const diffFields: string[] = [];
    if (before.startAt.getTime() !== updated.startAt.getTime()) diffFields.push("downbeat");
    if ((before.callTimeAt?.getTime() ?? 0) !== (updated.callTimeAt?.getTime() ?? 0)) diffFields.push("call time");
    if ((before.loadInAt?.getTime() ?? 0) !== (updated.loadInAt?.getTime() ?? 0)) diffFields.push("load in");
    if (before.venueId !== updated.venueId) diffFields.push("venue");
    if (before.status !== updated.status) diffFields.push("status");

    if (diffFields.length > 0) {
      await db.activity.create({
        data: {
          gigId: id,
          action: "gig_updated",
          summary: `Updated ${diffFields.join(", ")}`,
          payload: diffFields,
        },
      });
    }

    revalidatePath(`/gigs/${id}`);
    revalidatePath("/dashboard");
    redirect(`/gigs/${id}`);
  } else {
    // For new gigs, also add the current user as the leader personnel if they
    // have a "Leader" musician in their roster.
    const leader = await db.musician.findFirst({
      where: { ownerId: user.id, isLeader: true },
    });

    // Recurrence inputs from the form. Empty / "NONE" / count<=1 means a
    // one-off gig — same single-create behavior as before. Any other
    // combination creates additional independent gigs at the offset
    // interval, all with identical fields. Each new gig is its own
    // editable record (no recurrence parent) so changing one doesn't
    // touch the others. Capped at 52 occurrences to prevent runaway
    // form submissions from creating a year-plus of phantom gigs.
    const recurInterval = String(formData.get("recurInterval") ?? "NONE");
    const recurOccurrences = Math.min(
      52,
      Math.max(1, Number(formData.get("recurOccurrences") ?? 1) || 1),
    );

    const created = await db.gig.create({
      data: {
        ...data,
        ownerId: user.id,
        personnel: leader
          ? {
              create: [{ musicianId: leader.id, payCents: 0, position: 0 }],
            }
          : undefined,
      },
    });
    await db.activity.create({
      data: {
        gigId: created.id,
        action: "gig_created",
        summary: "Gig created",
      },
    });

    // Bulk-create the rest of the series. Each one is a clone of `data`
    // with every time field shifted by N intervals — same shape as the
    // anchor gig but on its own date. Skip if the FREE-plan cap would
    // be exceeded after the series; we only check the user's headroom
    // and silently truncate instead of failing the whole form (better
    // UX than "you almost booked 8 gigs but we created 0 of them").
    if (
      recurInterval !== "NONE" &&
      recurOccurrences > 1 &&
      (recurInterval === "WEEKLY" ||
        recurInterval === "BIWEEKLY" ||
        recurInterval === "MONTHLY")
    ) {
      const intervalMs =
        recurInterval === "WEEKLY"
          ? 7 * 24 * 60 * 60 * 1000
          : recurInterval === "BIWEEKLY"
            ? 14 * 24 * 60 * 60 * 1000
            : null; // MONTHLY handled separately to honor day-of-month

      const shift = (d: Date, n: number): Date => {
        if (intervalMs) return new Date(d.getTime() + intervalMs * n);
        // MONTHLY: bump month by N. JavaScript Date handles end-of-month
        // gracefully (e.g. Jan 31 + 1 month → Mar 3, not Feb 31).
        const copy = new Date(d);
        copy.setMonth(copy.getMonth() + n);
        return copy;
      };
      const shiftOpt = (d: Date | null, n: number): Date | null =>
        d ? shift(d, n) : null;

      for (let i = 1; i < recurOccurrences; i++) {
        try {
          await assertCanAdd(user, "activeGigs");
        } catch {
          // Out of headroom — stop creating the rest of the series
          // silently. The anchor gig and any successfully created
          // siblings stick around; the user can upgrade and try again.
          break;
        }
        const next = await db.gig.create({
          data: {
            ...data,
            startAt: shift(startAt, i),
            loadInAt: shiftOpt(loadInAt, i),
            soundcheckAt: shiftOpt(soundcheckAt, i),
            soundcheckEndAt: shiftOpt(soundcheckEndAt, i),
            callTimeAt: shiftOpt(callTimeAt, i),
            endAt: shiftOpt(endAt, i),
            secondStartAt: shiftOpt(secondStartAt, i),
            secondEndAt: shiftOpt(secondEndAt, i),
            ownerId: user.id,
            personnel: leader
              ? {
                  create: [{ musicianId: leader.id, payCents: 0, position: 0 }],
                }
              : undefined,
          },
        });
        await db.activity.create({
          data: {
            gigId: next.id,
            action: "gig_created",
            summary: `Gig created (recurring from ${created.id})`,
          },
        });
      }
    }

    revalidatePath("/dashboard");
    redirect(`/gigs/${created.id}`);
  }
}

// Clone a gig as an INQUIRY on a user-picked date. Copies venue, personnel
// (as GigPersonnel rows with same pay, no paidAt), the tech/attire/meal
// block, set list, materials URL, and notes. Doesn't copy expenses, paid
// state, QBO sync state, or activity.
//
// `newStartDateISO` is a "YYYY-MM-DD" string from the date picker the
// CloneGigButton renders. Every time field (load-in, soundcheck, call,
// downbeat, finish, 2nd set) shifts by the same day-delta as startAt, so
// the new gig's clock-times for each beat match the source. The user lands
// on the new gig in edit mode and can tweak from there.
export async function cloneGig(sourceId: string, newStartDateISO: string) {
  const user = await requireUser();

  // Clone counts against the active-gigs cap on FREE — otherwise
  // users could bypass the cap by cloning instead of creating.
  await assertCanAdd(user, "activeGigs");

  const src = await db.gig.findFirst({
    where: { id: sourceId, ownerId: user.id },
    include: { personnel: { orderBy: { position: "asc" } } },
  });
  if (!src) throw new Error("Source gig not found");

  // Parse the user-picked date into a Date with the SAME clock time as the
  // source gig's startAt — so if the source was Sat 8:00 PM and the user
  // picks the next Sat, the new gig is also 8:00 PM. Every other time field
  // shifts by the same day-delta so each beat lands the same number of
  // hours before/after the new startAt as it did the source.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(newStartDateISO);
  if (!m) throw new Error("Invalid date — expected YYYY-MM-DD");
  const [, yStr, monStr, dStr] = m;
  const weekLater = new Date(src.startAt);
  weekLater.setFullYear(Number(yStr), Number(monStr) - 1, Number(dStr));
  const dayDeltaMs = weekLater.getTime() - src.startAt.getTime();
  const bump = (d: Date | null) => {
    if (!d) return null;
    return new Date(d.getTime() + dayDeltaMs);
  };

  const created = await db.gig.create({
    data: {
      ownerId: user.id,
      venueId: src.venueId,
      startAt: weekLater,
      loadInAt: bump(src.loadInAt),
      soundcheckAt: bump(src.soundcheckAt),
      soundcheckEndAt: bump(src.soundcheckEndAt),
      callTimeAt: bump(src.callTimeAt),
      secondStartAt: bump(src.secondStartAt),
      secondEndAt: bump(src.secondEndAt),
      endAt: bump(src.endAt),
      status: "INQUIRY", // never clone a CONFIRMED / PLAYED status
      eventName: src.eventName,
      clientPayCents: src.clientPayCents,
      clientDepositCents: null,
      sound: src.sound,
      soundContactName: src.soundContactName,
      soundContactPhone: src.soundContactPhone,
      lights: src.lights,
      attire: src.attire,
      meal: src.meal,
      // Don't carry materials/setlist/stage-plot/loading-map files
      // forward on a clone. These are nearly always specific to the
      // source date (last week's set list, a venue's loading map that
      // got revised, an event-specific charts folder). If we copied
      // them, the new gig would silently inherit stale documents that
      // the bandleader has to remember to delete — easy miss.
      // loadingInfo (the free-text instructions) DOES come over since
      // it tends to be venue-stable. Same with loadingMapLink (an
      // external Google Maps pin URL — also venue-stable). The
      // uploaded files (Vercel Blob URLs) are what get reset.
      materialsUrl: null,
      setlistUrl: null,
      setlistFileName: null,
      loadingInfo: src.loadingInfo,
      loadingMapUrl: null,
      loadingMapLink: src.loadingMapLink,
      notes: src.notes,
      personnel: {
        create: src.personnel.map((p) => ({
          musicianId: p.musicianId,
          payCents: p.payCents,
          position: p.position,
        })),
      },
    },
  });

  await db.activity.create({
    data: {
      gigId: created.id,
      action: "gig_cloned",
      summary: `Cloned from ${src.id}`,
    },
  });

  revalidatePath("/dashboard");
  redirect(`/gigs/${created.id}/edit`);
}

// Persist a freshly-uploaded set list URL onto the gig record.
//
// Why this is a server action (and not just the Vercel Blob
// onUploadCompleted webhook): the webhook turned out to be unreliable
// in our Netlify-hosted environment — uploads kept "disappearing"
// because the webhook never reached the route, so the DB write never
// happened. The client uploader now calls THIS action directly after
// upload() resolves on the browser side, where it has cookies and the
// final blob URL in hand. This makes the save bulletproof: as long as
// the user's tab is open and the upload finishes, the URL gets to the
// DB. The webhook stays as a backup but is now idempotent.
export async function saveSetlistUploaded(
  gigId: string,
  blobUrl: string,
  fileName: string,
) {
  // Explicit logging so Netlify Functions logs show the call site if the
  // user's setlist mysteriously "disappears" again — we'll know whether
  // the server action ran, what the inputs were, and where it failed.
  console.log(
    `[saveSetlistUploaded] gigId=${gigId} url=${blobUrl} file=${fileName}`,
  );
  try {
    const user = await requireUser();
    const gig = await db.gig.findFirst({
      where: { id: gigId, ownerId: user.id },
    });
    if (!gig) {
      console.error(
        `[saveSetlistUploaded] gig not found or not owned by user ${user.id}`,
      );
      throw new Error("Gig not found");
    }

    await db.gig.update({
      where: { id: gigId },
      data: {
        setlistUrl: blobUrl,
        setlistFileName: fileName,
        setlistUpdatedAt: new Date(),
      },
    });
    await db.activity.create({
      data: {
        gigId,
        action: "field_updated:setlistUrl",
        summary: "Set list updated — band will be notified on fanout",
      },
    });
    revalidatePath(`/gigs/${gigId}`);
    revalidatePath(`/gigs/${gigId}/edit`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/finance`);
    revalidatePath(`/my-gigs`);
    revalidatePath(`/my-gigs/${gigId}`);
    console.log(`[saveSetlistUploaded] ok gigId=${gigId}`);
    return { ok: true } as const;
  } catch (err) {
    console.error(
      `[saveSetlistUploaded] FAILED gigId=${gigId}`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

// Contract upload — same client-side commit pattern as setlist, but
// bandleader-private. Never creates an Activity row (paperwork isn't
// something the band's activity feed needs to see) and only
// revalidates the bandleader-only surfaces.
export async function saveContractUploaded(
  gigId: string,
  blobUrl: string,
  fileName: string,
) {
  console.log(
    `[saveContractUploaded] gigId=${gigId} url=${blobUrl} file=${fileName}`,
  );
  const user = await requireUser();
  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
    select: { id: true },
  });
  if (!gig) throw new Error("Gig not found");

  await db.gig.update({
    where: { id: gigId },
    data: {
      contractUrl: blobUrl,
      contractFileName: fileName,
    },
  });
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  return { ok: true } as const;
}

// Clear the uploaded contract — sets both fields to null so the
// bandleader can re-upload a corrected version. Same auth shape.
export async function removeContract(gigId: string) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
    select: { id: true },
  });
  if (!gig) throw new Error("Gig not found");
  await db.gig.update({
    where: { id: gigId },
    data: { contractUrl: null, contractFileName: null },
  });
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  return { ok: true } as const;
}

// Detach the current set list from a gig. We null out the URL +
// filename + updated-at fields so the gig goes back to the empty
// upload state. The Blob storage object itself is left in place —
// Vercel Blob has its own retention rules and we don't want a
// double-fire (delete fails + DB write succeeds = orphan UI). Most
// common reason this gets called: the gig was cloned and the inherited
// set list from the source date no longer applies.
export async function clearSetlist(gigId: string) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
  });
  if (!gig) throw new Error("Gig not found");
  await db.gig.update({
    where: { id: gigId },
    data: {
      setlistUrl: null,
      setlistFileName: null,
      // Leave setlistUpdatedAt as-is so the activity log timestamp
      // remains meaningful for the most recent change.
    },
  });
  await db.activity.create({
    data: {
      gigId,
      action: "field_updated:setlistUrl",
      summary: "Set list removed",
    },
  });
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/my-gigs/${gigId}`);
  return { ok: true } as const;
}

// Persist a freshly-uploaded loading map (image OR PDF) onto the gig.
// Same rationale as saveSetlistUploaded — see comment above.
export async function saveLoadingMapUploaded(
  gigId: string,
  blobUrl: string,
) {
  console.log(`[saveLoadingMapUploaded] gigId=${gigId} url=${blobUrl}`);
  try {
    const user = await requireUser();
    const gig = await db.gig.findFirst({
      where: { id: gigId, ownerId: user.id },
    });
    if (!gig) {
      console.error(
        `[saveLoadingMapUploaded] gig not found or not owned by user ${user.id}`,
      );
      throw new Error("Gig not found");
    }

    await db.gig.update({
      where: { id: gigId },
      data: { loadingMapUrl: blobUrl },
    });
    await db.activity.create({
      data: {
        gigId,
        action: "field_updated:loadingMapUrl",
        summary: "Loading map uploaded",
      },
    });
    revalidatePath(`/gigs/${gigId}`);
    revalidatePath(`/gigs/${gigId}/edit`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/finance`);
    revalidatePath(`/my-gigs`);
    revalidatePath(`/my-gigs/${gigId}`);
    console.log(`[saveLoadingMapUploaded] ok gigId=${gigId}`);
    return { ok: true } as const;
  } catch (err) {
    console.error(
      `[saveLoadingMapUploaded] FAILED gigId=${gigId}`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

// Persist a freshly-uploaded stage plot (image OR PDF) onto the gig.
// Same disappearing-after-edit defense as setlist + loading map: this is a
// dedicated server action, NOT part of upsertGig's payload. Once uploaded,
// the file URL + filename stick to the gig until explicitly replaced or
// cleared via updateGigField.
export async function saveStagePlotUploaded(
  gigId: string,
  blobUrl: string,
  fileName: string,
) {
  console.log(
    `[saveStagePlotUploaded] gigId=${gigId} url=${blobUrl} file=${fileName}`,
  );
  try {
    const user = await requireUser();
    const gig = await db.gig.findFirst({
      where: { id: gigId, ownerId: user.id },
    });
    if (!gig) {
      console.error(
        `[saveStagePlotUploaded] gig not found or not owned by user ${user.id}`,
      );
      throw new Error("Gig not found");
    }

    await db.gig.update({
      where: { id: gigId },
      data: { stagePlotUrl: blobUrl, stagePlotFileName: fileName },
    });
    await db.activity.create({
      data: {
        gigId,
        action: "field_updated:stagePlotUrl",
        summary: "Stage plot uploaded",
      },
    });
    revalidatePath(`/gigs/${gigId}`);
    revalidatePath(`/gigs/${gigId}/edit`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/finance`);
    revalidatePath(`/my-gigs`);
    revalidatePath(`/my-gigs/${gigId}`);
    console.log(`[saveStagePlotUploaded] ok gigId=${gigId}`);
    return { ok: true } as const;
  } catch (err) {
    console.error(
      `[saveStagePlotUploaded] FAILED gigId=${gigId}`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

// Rooming list uploaded (PDF or image) — same client-first commit pattern as
// saveStagePlotUploaded. The uploaded document is one of the two forms
// rooming info can take (the other is typed roomingInfo text). Clearing is
// done via updateGigField("roomingUrl", null), which also clears the filename.
export async function saveRoomingUploaded(
  gigId: string,
  blobUrl: string,
  fileName: string,
) {
  console.log(
    `[saveRoomingUploaded] gigId=${gigId} url=${blobUrl} file=${fileName}`,
  );
  try {
    const user = await requireUser();
    const gig = await db.gig.findFirst({
      where: { id: gigId, ownerId: user.id },
    });
    if (!gig) {
      console.error(
        `[saveRoomingUploaded] gig not found or not owned by user ${user.id}`,
      );
      throw new Error("Gig not found");
    }

    await db.gig.update({
      where: { id: gigId },
      data: { roomingUrl: blobUrl, roomingFileName: fileName },
    });
    await db.activity.create({
      data: {
        gigId,
        action: "field_updated:roomingUrl",
        summary: "Rooming list uploaded",
      },
    });
    revalidatePath(`/gigs/${gigId}`);
    revalidatePath(`/gigs/${gigId}/edit`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/finance`);
    revalidatePath(`/my-gigs`);
    revalidatePath(`/my-gigs/${gigId}`);
    console.log(`[saveRoomingUploaded] ok gigId=${gigId}`);
    return { ok: true } as const;
  } catch (err) {
    console.error(
      `[saveRoomingUploaded] FAILED gigId=${gigId}`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

export async function deleteGig(id: string) {
  const user = await requireUser();
  await db.gig.delete({ where: { id, ownerId: user.id } });
  // Bust every page that aggregates gigs/pay so a deleted gig doesn't
  // linger on dashboards or year totals after redirect.
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/my-gigs");
  redirect("/dashboard");
}

export async function addPersonnel(
  gigId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const musicianId = String(formData.get("musicianId") ?? "").trim();
  if (!musicianId) throw new Error("Select a musician");

  const payCents = parseMoneyToCents(formData.get("pay")) ?? 0;

  const existingCount = await db.gigPersonnel.count({ where: { gigId } });

  await db.gigPersonnel.create({
    data: {
      gigId,
      musicianId,
      payCents,
      position: existingCount,
    },
  });

  const musician = await db.musician.findUnique({ where: { id: musicianId } });
  await db.activity.create({
    data: {
      gigId,
      action: "personnel_added",
      summary: `Added ${musician?.name ?? "musician"}`,
    },
  });

  // Pay rollups on the dashboard and finance page now include this row,
  // and the new musician's own portal needs to know about the gig too.
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
  revalidatePath(`/my-gigs`);
  redirect(`/gigs/${gigId}/edit`);
}

// Update a personnel row's pay in place. Lets the bandleader dial in a
// musician's amount as the deal comes together without removing-and-readding
// the row (which used to be the only path). Activity log records both the
// before and after so the audit trail is complete.
export async function updatePersonnelPay(
  gigId: string,
  personnelId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const newPayCents = parseMoneyToCents(formData.get("pay")) ?? 0;

  const before = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gigId },
    include: { musician: true },
  });
  if (!before) throw new Error("Personnel row not found");

  // No-op if the value hasn't changed — avoids noise in the activity log.
  // Still revalidate so the form's "Saved" affordance reflects truth.
  if (before.payCents === newPayCents) {
    revalidatePath(`/gigs/${gigId}`);
    return;
  }

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: { payCents: newPayCents },
  });

  await db.activity.create({
    data: {
      gigId,
      action: "personnel_pay_updated",
      summary: `Updated ${before.musician.name}'s pay: $${(before.payCents / 100).toFixed(0)} → $${(newPayCents / 100).toFixed(0)}`,
    },
  });

  // Bust the cache for every surface that rolls up musician pay so band
  // totals, year-to-date numbers, and the affected musician's own portal
  // all reflect the new value immediately.
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
  revalidatePath(`/my-gigs`);
  revalidatePath(`/my-gigs/${gigId}`);
  revalidatePath(`/my-earnings`);
}

// Toggle whether a personnel row appears in the Lineup section of
// outgoing emails. Default is true; flipping to false suppresses the
// row from other recipients' email — useful for crew/contractors
// (sound, lights, booking agent) whose contact info shouldn't be
// circulated to the rest of the band. The person still receives their
// own email copy if their notify flags are on.
export async function setPersonnelIncludeInLineup(
  gigId: string,
  personnelId: string,
  include: boolean,
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const before = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gigId },
    include: { musician: { select: { name: true } } },
  });
  if (!before) throw new Error("Personnel row not found");

  if (before.includeInLineup === include) {
    revalidatePath(`/gigs/${gigId}`);
    return;
  }

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: { includeInLineup: include },
  });

  await db.activity.create({
    data: {
      gigId,
      action: "personnel_lineup_visibility_changed",
      summary: include
        ? `${before.musician.name} will appear in outgoing email lineup`
        : `${before.musician.name} hidden from outgoing email lineup`,
    },
  });

  revalidatePath(`/gigs/${gigId}`);
}

export async function removePersonnel(
  gigId: string,
  personnelId: string,
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const p = await db.gigPersonnel.findUnique({
    where: { id: personnelId },
    include: { musician: true },
  });

  await db.gigPersonnel.delete({ where: { id: personnelId } });

  if (p) {
    await db.activity.create({
      data: {
        gigId,
        action: "personnel_removed",
        summary: `Removed ${p.musician.name}`,
      },
    });
  }

  // Removing a musician also drops their pay from band rollups, and the
  // musician loses access to the gig from their portal.
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
  revalidatePath(`/my-gigs`);
  if (p) revalidatePath(`/my-gigs/${gigId}`);
  redirect(`/gigs/${gigId}/edit`);
}

// Save the full payout worksheet — income fields, per-musician pay, and the
// list of expenses — in a single atomic write. Creates/updates/deletes expense
// rows as needed so the UI can treat it as "replace everything" without
// worrying about individual row IDs.
export async function savePayout(
  gigId: string,
  payload: {
    clientPayCents: number | null;
    clientDepositCents: number | null;
    personnel: Array<{ id: string; payCents: number; paidAt?: Date | null }>;
    newPersonnel?: Array<{
      musicianId: string;
      payCents: number;
      paidAt?: Date | null;
      position: number;
    }>;
    deletedPersonnelIds?: string[];
    expenses: Array<{
      id?: string;
      label: string;
      amountCents: number;
      position: number;
      paidAt?: Date | null;
      kind?: "GENERAL" | "MILEAGE" | "MEAL" | "PER_DIEM" | "LODGING" | "TRAVEL";
      miles?: number | null;
      days?: number | null;
    }>;
  },
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  await db.$transaction(async (tx) => {
    await tx.gig.update({
      where: { id: gigId },
      data: {
        clientPayCents: payload.clientPayCents,
        clientDepositCents: payload.clientDepositCents,
      },
    });

    // Remove personnel the user dropped from the worksheet
    if (payload.deletedPersonnelIds && payload.deletedPersonnelIds.length > 0) {
      await tx.gigPersonnel.deleteMany({
        where: {
          id: { in: payload.deletedPersonnelIds },
          gig: { ownerId: user.id },
        },
      });
    }

    for (const p of payload.personnel) {
      await tx.gigPersonnel.update({
        where: { id: p.id },
        data: {
          payCents: p.payCents,
          paidAt: p.paidAt ?? null,
        },
      });
    }

    // Create personnel rows added via the worksheet typeahead
    for (const np of payload.newPersonnel ?? []) {
      // Skip if already on the gig (prevents a unique-constraint violation if
      // the same musician was typed twice)
      const existing = await tx.gigPersonnel.findFirst({
        where: { gigId, musicianId: np.musicianId },
      });
      if (existing) {
        await tx.gigPersonnel.update({
          where: { id: existing.id },
          data: { payCents: np.payCents, paidAt: np.paidAt ?? null },
        });
      } else {
        await tx.gigPersonnel.create({
          data: {
            gigId,
            musicianId: np.musicianId,
            payCents: np.payCents,
            paidAt: np.paidAt ?? null,
            position: np.position,
          },
        });
      }
    }

    const existing = await tx.gigExpense.findMany({ where: { gigId } });
    const keepIds = new Set(
      payload.expenses.map((e) => e.id).filter(Boolean) as string[],
    );
    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length > 0) {
      await tx.gigExpense.deleteMany({
        where: { id: { in: toDelete.map((e) => e.id) } },
      });
    }

    for (const e of payload.expenses) {
      const taxFields = {
        kind: e.kind ?? "GENERAL",
        miles: e.miles ?? null,
        days: e.days ?? null,
      };
      if (e.id) {
        await tx.gigExpense.update({
          where: { id: e.id },
          data: {
            label: e.label,
            amountCents: e.amountCents,
            position: e.position,
            paidAt: e.paidAt ?? null,
            ...taxFields,
          },
        });
      } else {
        await tx.gigExpense.create({
          data: {
            gigId,
            label: e.label,
            amountCents: e.amountCents,
            position: e.position,
            paidAt: e.paidAt ?? null,
            ...taxFields,
          },
        });
      }
    }
  });

  await db.activity.create({
    data: {
      gigId,
      action: "payout_saved",
      summary: "Payout worksheet updated",
    },
  });

  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/finance`);
  revalidatePath(`/dashboard`);
}

// Inline edits from the gig detail page — notes, materials URL, setlist URL.
// Each write produces an Activity entry (the foundation for future diff-aware
// SMS/email fanouts to personnel).
export async function updateGigField(
  gigId: string,
  field:
    | "eventName"
    | "notes"
    | "materialsUrl"
    | "setlistUrl"
    | "setlistFileName"
    | "sound"
    | "soundContactName"
    | "soundContactPhone"
    | "lights"
    | "attire"
    | "meal"
    | "loadingInfo"
    | "loadingMapUrl"
    | "loadingMapLink"
    | "stagePlotUrl"
    | "stagePlotFileName"
    | "roomingInfo"
    | "roomingUrl"
    | "roomingFileName"
    | "privateFinanceNotes",
  value: string | null,
) {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const clean = value && value.trim() !== "" ? value.trim() : null;

  const data: Record<string, unknown> = { [field]: clean };
  if (field === "setlistUrl") {
    data.setlistUpdatedAt = new Date();
  }
  // Clearing the stage plot URL also clears the stored filename so the
  // empty-state UI matches the empty-state data.
  if (field === "stagePlotUrl" && clean === null) {
    data.stagePlotFileName = null;
  }
  // Same for the rooming list document: clearing the URL clears the filename.
  if (field === "roomingUrl" && clean === null) {
    data.roomingFileName = null;
  }

  await db.gig.update({ where: { id: gigId }, data });

  const labels: Record<string, string> = {
    eventName: "Event name updated",
    notes: "Notes updated",
    materialsUrl: "Gig materials link updated",
    setlistUrl: "Set list updated — band will be notified on fanout",
    setlistFileName: "Set list filename updated",
    loadingInfo: "Loading info updated",
    loadingMapUrl: "Loading map uploaded",
    loadingMapLink: "Alternate map link updated",
    stagePlotUrl: "Stage plot uploaded",
    stagePlotFileName: "Stage plot filename updated",
    roomingInfo: "Rooming info updated",
    roomingUrl: "Rooming list uploaded",
    roomingFileName: "Rooming list filename updated",
    privateFinanceNotes: "Private finance notes updated",
  };
  await db.activity.create({
    data: {
      gigId,
      action: `field_updated:${field}`,
      summary: labels[field] ?? "Updated",
    },
  });

  revalidatePath(`/gigs/${gigId}`);
}

// Mark every unpaid GigPersonnel row on this gig as paid today with the
// given method. No-op for rows that already have paidAt set — we don't
// overwrite their existing paid date / method. Returns the number of
// rows newly marked paid.
export async function markAllPaid(
  gigId: string,
  method: string,
): Promise<{ count: number }> {
  const user = await requireUser();
  const gig = await db.gig.findFirst({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  const validMethods = new Set([
    "VENMO",
    "PAYPAL",
    "ZELLE",
    "CASHAPP",
    "CASH",
    "CHECK",
    "DIRECT_DEPOSIT",
    "OTHER",
  ]);
  if (!validMethods.has(method)) throw new Error("Invalid payment method");

  const result = await db.gigPersonnel.updateMany({
    where: { gigId, paidAt: null },
    data: {
      paidAt: new Date(),
      paidMethod: method as
        | "VENMO"
        | "PAYPAL"
        | "ZELLE"
        | "CASHAPP"
        | "CASH"
        | "CHECK"
        | "DIRECT_DEPOSIT"
        | "OTHER",
    },
  });

  if (result.count > 0) {
    await db.activity.create({
      data: {
        gigId,
        action: "bulk_paid",
        summary: `Marked ${result.count} musician${result.count === 1 ? "" : "s"} paid via ${method.toLowerCase()}`,
      },
    });
  }

  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/finance`);
  return { count: result.count };
}

export async function markPaid(personnelId: string, method: string) {
  const user = await requireUser();
  const p = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
  });
  if (!p) throw new Error("Not found");

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: {
      paidAt: new Date(),
      paidMethod: method as
        | "VENMO"
        | "PAYPAL"
        | "ZELLE"
        | "CASHAPP"
        | "CASH"
        | "CHECK"
        | "DIRECT_DEPOSIT"
        | "OTHER",
    },
  });
  revalidatePath(`/gigs/${p.gigId}`);
  revalidatePath(`/finance`);
}

// Auto-save just the client-pay total on a gig. Used by the
// PayoutWorksheet's MoneyInput onBlur so a value change doesn't get
// lost if the bandleader walks away without clicking the worksheet's
// Save button. Idempotent: writing the same value twice is fine.
export async function updateGigClientPay(
  gigId: string,
  clientPayCents: number | null,
) {
  console.log(
    `[updateGigClientPay] gigId=${gigId} cents=${clientPayCents}`,
  );
  const user = await requireUser();
  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
  });
  if (!gig) throw new Error("Gig not found");

  if (gig.clientPayCents === clientPayCents) {
    // No-op — value unchanged. Avoids a spurious activity entry on
    // every blur of an unchanged input.
    return { ok: true } as const;
  }

  await db.gig.update({
    where: { id: gigId },
    data: { clientPayCents },
  });
  await db.activity.create({
    data: {
      gigId,
      action: "field_updated:clientPayCents",
      summary:
        clientPayCents == null
          ? "Client pay cleared"
          : `Client pay updated to $${(clientPayCents / 100).toFixed(2)}`,
    },
  });
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
  return { ok: true } as const;
}

// One-click "mark paid today" — no method picker. Inherits the
// musician's preferred paymentMethod from their roster row, falling
// back to OTHER when nothing's been set. The companion to markAllPaid:
// that one bulk-pays everyone via a chosen method, this one bumps a
// single person along while you're paying them. Used by the inline
// "Mark paid" chip on the PayoutWorksheet so the bandleader can pay
// people as they Venmo them, no extra clicks.
export async function markPaidQuick(personnelId: string) {
  const user = await requireUser();
  const p = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
    include: { musician: { select: { paymentMethod: true } } },
  });
  if (!p) throw new Error("Not found");

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: {
      paidAt: new Date(),
      paidMethod: (p.musician.paymentMethod ?? "OTHER") as
        | "VENMO"
        | "PAYPAL"
        | "ZELLE"
        | "CASHAPP"
        | "CASH"
        | "CHECK"
        | "DIRECT_DEPOSIT"
        | "OTHER",
    },
  });
  revalidatePath(`/gigs/${p.gigId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
}

// Inverse of markPaid — clears the paid timestamp + method. Lets the
// bandleader fix an accidental "Mark paid" click without re-editing
// the row.
export async function unmarkPaid(personnelId: string) {
  const user = await requireUser();
  const p = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
  });
  if (!p) throw new Error("Not found");

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: { paidAt: null, paidMethod: null },
  });
  revalidatePath(`/gigs/${p.gigId}`);
  revalidatePath(`/dashboard`);
  revalidatePath(`/finance`);
}

// ── helpers ──────────────────────────────────────────

function combineDateTime(date: string, time: string): Date {
  // Browser gives us "YYYY-MM-DD" and "HH:MM". Construct a Date in the server's
  // local timezone. Later we'll let users set a per-gig timezone.
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm!, 0, 0);
}

function combineOptionalTime(
  date: string,
  time: FormDataEntryValue | null,
): Date | null {
  const t = time == null ? "" : String(time).trim();
  if (!t) return null;
  return combineDateTime(date, t);
}

function parseMoneyToCents(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  // Strip $, commas, spaces
  const cleaned = String(v).replace(/[$,\s]/g, "");
  const num = Number.parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

type GigStatus = "INQUIRY" | "HOLD" | "CONFIRMED" | "PLAYED" | "CANCELLED";

export async function upsertGig(id: string | null, formData: FormData) {
  const user = await requireUser();

  // The form gives us a local date + individual time fields. We combine them
  // into DateTime values below. All gig times share the same calendar date.
  const dateStr = String(formData.get("date") ?? "").trim();
  if (!dateStr) throw new Error("Date is required");

  const startTime = String(formData.get("startTime") ?? "").trim();
  if (!startTime) throw new Error("Downbeat time is required");

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
    revalidatePath("/dashboard");
    redirect(`/gigs/${created.id}`);
  }
}

// Clone a gig as an INQUIRY on today's date. Copies venue, personnel (as
// GigPersonnel rows with same pay, no paidAt), the tech/attire/meal block,
// set list, materials URL, and notes. Doesn't copy expenses, paid state,
// QBO sync state, or activity. The user lands on the new gig in edit mode
// and typically just changes the date.
export async function cloneGig(sourceId: string) {
  const user = await requireUser();
  const src = await db.gig.findFirst({
    where: { id: sourceId, ownerId: user.id },
    include: { personnel: { orderBy: { position: "asc" } } },
  });
  if (!src) throw new Error("Source gig not found");

  // Default the new gig to 1 week out at the same times. Nine times out of ten
  // that's closer to what the user wants than "today".
  const weekLater = new Date(src.startAt);
  weekLater.setDate(weekLater.getDate() + 7);
  const bump = (d: Date | null) => {
    if (!d) return null;
    const out = new Date(d);
    out.setDate(out.getDate() + 7);
    return out;
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
      clientPayCents: src.clientPayCents,
      clientDepositCents: null,
      sound: src.sound,
      soundContactName: src.soundContactName,
      soundContactPhone: src.soundContactPhone,
      lights: src.lights,
      attire: src.attire,
      meal: src.meal,
      materialsUrl: src.materialsUrl,
      setlistUrl: src.setlistUrl,
      setlistFileName: src.setlistFileName,
      loadingInfo: src.loadingInfo,
      loadingMapUrl: src.loadingMapUrl,
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
    | "loadingMapLink",
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

  await db.gig.update({ where: { id: gigId }, data });

  const labels: Record<string, string> = {
    notes: "Notes updated",
    materialsUrl: "Gig materials link updated",
    setlistUrl: "Set list updated — band will be notified on fanout",
    setlistFileName: "Set list filename updated",
    loadingInfo: "Loading info updated",
    loadingMapUrl: "Loading map uploaded",
    loadingMapLink: "Alternate map link updated",
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

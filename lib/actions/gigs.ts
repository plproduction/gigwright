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
  const callTimeAt = combineOptionalTime(dateStr, formData.get("callTime"));
  const endAt = combineOptionalTime(dateStr, formData.get("endTime"));

  const clientPayCents = parseMoneyToCents(formData.get("clientPay"));
  const clientDepositCents = parseMoneyToCents(formData.get("clientDeposit"));

  const data = {
    venueId: nullIfEmpty(formData.get("venueId")),
    startAt,
    loadInAt,
    soundcheckAt,
    callTimeAt,
    endAt,
    status: String(formData.get("status") ?? "CONFIRMED") as GigStatus,
    clientPayCents,
    clientDepositCents,
    sound: nullIfEmpty(formData.get("sound")),
    lights: nullIfEmpty(formData.get("lights")),
    attire: nullIfEmpty(formData.get("attire")),
    meal: nullIfEmpty(formData.get("meal")),
    notes: nullIfEmpty(formData.get("notes")),
    materialsUrl: nullIfEmpty(formData.get("materialsUrl")),
    setlistUrl: nullIfEmpty(formData.get("setlistUrl")),
    setlistFileName: nullIfEmpty(formData.get("setlistFileName")),
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

export async function deleteGig(id: string) {
  const user = await requireUser();
  await db.gig.delete({ where: { id, ownerId: user.id } });
  revalidatePath("/dashboard");
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

  revalidatePath(`/gigs/${gigId}`);
  redirect(`/gigs/${gigId}/edit`);
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

  revalidatePath(`/gigs/${gigId}`);
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
      if (e.id) {
        await tx.gigExpense.update({
          where: { id: e.id },
          data: {
            label: e.label,
            amountCents: e.amountCents,
            position: e.position,
            paidAt: e.paidAt ?? null,
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

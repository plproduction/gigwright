"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCanAdd } from "@/lib/plan";

export async function upsertMusician(
  id: string | null,
  formData: FormData,
) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
  }

  // FREE plan caps the roster at FREE_LIMITS.musicians. The gate
  // only fires on *new* rows, so existing musicians can always be
  // edited even after a downgrade — the cap is on additions.
  if (!id) {
    await assertCanAdd(user, "musicians");
  }

  const roles = String(formData.get("roles") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = {
    name,
    email: nullIfEmpty(formData.get("email")),
    phone: nullIfEmpty(formData.get("phone")),
    initials: nullIfEmpty(formData.get("initials")),
    roles,
    isLeader: formData.get("isLeader") === "on",
    calendarProvider:
      (String(formData.get("calendarProvider") ?? "NONE") as
        | "ICLOUD"
        | "GOOGLE"
        | "OUTLOOK"
        | "NONE"),
    paymentMethod: nullIfEmpty(formData.get("paymentMethod")) as
      | null
      | "VENMO"
      | "PAYPAL"
      | "ZELLE"
      | "CASHAPP"
      | "CASH"
      | "CHECK"
      | "DIRECT_DEPOSIT"
      | "OTHER",
    payoutAddress: nullIfEmpty(formData.get("payoutAddress")),
    notifyBySms: formData.get("notifyBySms") === "on",
    // Email is mandatory for gig coordination — always on, no opt-out.
    // The roster form no longer renders an email toggle, so hard-set true
    // rather than reading a now-absent checkbox that would coerce false.
    notifyByEmail: true,
    notes: nullIfEmpty(formData.get("notes")),
  };

  const w9Received = formData.get("w9Received") === "on";

  if (id) {
    const existing = await db.musician.findFirst({
      where: { id, ownerId: user.id },
    });
    const transitioning = w9Received && !existing?.w9Received;
    await db.musician.update({
      where: { id, ownerId: user.id },
      data: {
        ...data,
        w9Received,
        w9ReceivedAt: transitioning
          ? new Date()
          : w9Received
            ? existing?.w9ReceivedAt ?? new Date()
            : null,
      },
    });
  } else {
    await db.musician.create({
      data: {
        ...data,
        ownerId: user.id,
        w9Received,
        w9ReceivedAt: w9Received ? new Date() : null,
      },
    });
  }

  revalidatePath("/roster");
  redirect("/roster");
}

export async function deleteMusician(id: string) {
  const user = await requireUser();
  await db.musician.delete({ where: { id, ownerId: user.id } });
  revalidatePath("/roster");
  redirect("/roster");
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

// "My Crew" management — Patrick's design 2026-08-06:
// - Crew is a saved default lineup that pre-fills new gigs.
// - Managed exclusively through the gig form (no roster-page toggle).
// - Save operation is a full replace: whoever is passed in becomes
//   the new Crew; everyone else's isCrew is cleared. This mirrors
//   the user's mental model of "these ten are my crew right now"
//   rather than "add/remove one at a time."
// - Load is a passive read used to pre-fill the personnel section.

export async function saveAsMyCrew(musicianIds: string[]) {
  const user = await requireUser();
  // Constrain to musicians actually on this bandleader's roster — a
  // malicious/bad client can't flip isCrew on someone else's musician
  // by passing their id. findMany + filter is the guard.
  const owned = await db.musician.findMany({
    where: { id: { in: musicianIds }, ownerId: user.id },
    select: { id: true },
  });
  const validIds = owned.map((m) => m.id);

  // Two-step: clear Crew for everyone on the roster, then set it on
  // the intended subset. Runs in a transaction so we never leave the
  // roster with a partially-updated Crew state.
  await db.$transaction([
    db.musician.updateMany({
      where: { ownerId: user.id, isCrew: true },
      data: { isCrew: false },
    }),
    db.musician.updateMany({
      where: { id: { in: validIds }, ownerId: user.id },
      data: { isCrew: true },
    }),
  ]);

  revalidatePath("/gigs/new");
  revalidatePath("/roster");
  return { ok: true, count: validIds.length } as const;
}

// Returns the current My Crew musicians for the calling bandleader,
// in the same shape the gig form uses for personnel selection.
// Empty array if Crew hasn't been set yet.
export async function loadMyCrew() {
  const user = await requireUser();
  const crew = await db.musician.findMany({
    where: { ownerId: user.id, isCrew: true },
    orderBy: [{ isLeader: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isLeader: true },
  });
  return crew;
}

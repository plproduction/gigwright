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

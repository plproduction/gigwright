"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function upsertMusician(
  id: string | null,
  formData: FormData,
) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name is required");
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
    notifyBySms: formData.get("notifyBySms") === "on",
    notifyByEmail: formData.get("notifyByEmail") === "on",
    notes: nullIfEmpty(formData.get("notes")),
  };

  if (id) {
    await db.musician.update({
      where: { id, ownerId: user.id },
      data,
    });
  } else {
    await db.musician.create({
      data: { ...data, ownerId: user.id },
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

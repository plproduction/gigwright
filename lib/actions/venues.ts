"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function upsertVenue(id: string | null, formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const data = {
    name,
    addressL1: nullIfEmpty(formData.get("addressL1")),
    addressL2: nullIfEmpty(formData.get("addressL2")),
    city: nullIfEmpty(formData.get("city")),
    state: nullIfEmpty(formData.get("state")),
    postalCode: nullIfEmpty(formData.get("postalCode")),
    country: String(formData.get("country") ?? "US").trim() || "US",
    phone: nullIfEmpty(formData.get("phone")),
    contactName: nullIfEmpty(formData.get("contactName")),
    contactEmail: nullIfEmpty(formData.get("contactEmail")),
    notes: nullIfEmpty(formData.get("notes")),
    timezone: String(formData.get("timezone") ?? "America/New_York"),
  };

  if (id) {
    await db.venue.update({ where: { id, ownerId: user.id }, data });
  } else {
    await db.venue.create({ data: { ...data, ownerId: user.id } });
  }

  revalidatePath("/venues");
  redirect("/venues");
}

export async function deleteVenue(id: string) {
  const user = await requireUser();
  await db.venue.delete({ where: { id, ownerId: user.id } });
  revalidatePath("/venues");
  redirect("/venues");
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

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
    payoutAddress: nullIfEmpty(formData.get("payoutAddress")),
    notifyBySms: formData.get("notifyBySms") === "on",
    notifyByEmail: formData.get("notifyByEmail") === "on",
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

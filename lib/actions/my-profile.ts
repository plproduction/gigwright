"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import type { PaymentMethod } from "@/lib/payment-methods";

// Save the logged-in musician's preferences. Applies to ALL Musician rows
// linked to this User (one musician email can be on multiple bandleaders'
// rosters; we keep their profile in lockstep across all of them).
//
// Lives in its own server-actions file (rather than inline in the
// /my-profile page) so the closure is clean and any thrown error is
// visible in the Netlify Functions log. Inline server actions with
// captured state are fragile; this is the boring, debuggable shape.
export async function saveMyProfile(formData: FormData) {
  const user = await requireMusician();

  const calendarRaw = String(formData.get("calendarProvider") ?? "NONE");
  const calendarProvider = (
    ["ICLOUD", "GOOGLE", "OUTLOOK", "NONE"].includes(calendarRaw)
      ? calendarRaw
      : "NONE"
  ) as "ICLOUD" | "GOOGLE" | "OUTLOOK" | "NONE";

  const paymentRaw = nullIfEmpty(formData.get("paymentMethod"));
  const paymentValid: PaymentMethod[] = [
    "VENMO",
    "PAYPAL",
    "ZELLE",
    "CASHAPP",
    "CASH",
    "CHECK",
    "DIRECT_DEPOSIT",
    "OTHER",
  ];
  const paymentMethod = (
    paymentRaw && paymentValid.includes(paymentRaw as PaymentMethod)
      ? (paymentRaw as PaymentMethod)
      : null
  ) as PaymentMethod | null;

  const data = {
    email: nullIfEmpty(formData.get("email")),
    phone: nullIfEmpty(formData.get("phone")),
    calendarProvider,
    paymentMethod,
    payoutAddress: nullIfEmpty(formData.get("payoutAddress")),
    notifyBySms: formData.get("notifyBySms") === "on",
    notifyByEmail: formData.get("notifyByEmail") === "on",
    w9Received: formData.get("w9Received") === "on",
  };

  // Log so the Netlify Functions log shows what the musician saved (or
  // why it failed) — invaluable for debugging "I changed my Venmo and it
  // didn't stick" without having to ask the user for screenshots.
  console.log(
    `[saveMyProfile] userId=${user.id} email=${data.email} method=${data.paymentMethod} addr=${data.payoutAddress ? "<set>" : "<empty>"}`,
  );

  try {
    const result = await db.musician.updateMany({
      where: { userId: user.id },
      data,
    });
    console.log(
      `[saveMyProfile] ok userId=${user.id} rowsUpdated=${result.count}`,
    );
  } catch (err) {
    console.error(
      `[saveMyProfile] FAILED userId=${user.id}`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }

  // Hard-refresh the profile page so the form re-renders with the new
  // saved values. Without this, the inline form action would silently
  // succeed but the page would re-render with the prior render's
  // `primary.email` / `primary.paymentMethod` snapshot — appearing
  // to the musician as "nothing saved." Also revalidates roster +
  // dashboard so leader-side views pick up the new info.
  revalidatePath("/my-profile");
  revalidatePath("/roster");
  revalidatePath("/dashboard");

  // Land on the same page with ?saved=1 so the UI can show a success
  // banner without holding any client-side state.
  redirect("/my-profile?saved=1");
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

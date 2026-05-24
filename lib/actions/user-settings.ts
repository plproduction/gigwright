"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ALL_METHODS, type PaymentMethod } from "@/lib/payment-methods";

// Save the bandleader's OWN payment info (their preferred method + the
// handle / address that goes with it). This is the data clients pay them
// to, or that another bandleader would use to pay them as a sideman. Lives
// on their leader Musician row (ownerId = this user, isLeader = true). If
// the row doesn't exist yet (some bandleaders never explicitly added
// themselves to their own roster) we upsert it from the User's name +
// email so it appears alongside their band.
export async function saveLeaderPayment(formData: FormData) {
  const user = await requireUser();

  const allowedValues = new Set<PaymentMethod>(
    ALL_METHODS.map((m) => m.value),
  );
  const rawMethod = String(formData.get("paymentMethod") ?? "").trim();
  const paymentMethod = (
    rawMethod && allowedValues.has(rawMethod as PaymentMethod)
      ? (rawMethod as PaymentMethod)
      : null
  ) as PaymentMethod | null;

  const payoutAddress = nullIfEmpty(formData.get("payoutAddress"));

  const existing = await db.musician.findFirst({
    where: { ownerId: user.id, isLeader: true },
    select: { id: true },
  });

  if (existing) {
    await db.musician.update({
      where: { id: existing.id },
      data: { paymentMethod, payoutAddress },
    });
  } else {
    // No leader row yet — make one so the bandleader's own pay info shows
    // up on every gig sheet and email. Name pulled from User.name (their
    // display name) and falls back to the email local part if blank.
    const name = user.name?.trim() || user.email.split("@")[0] || "Leader";
    await db.musician.create({
      data: {
        ownerId: user.id,
        userId: user.id,
        name,
        email: user.email,
        isLeader: true,
        paymentMethod,
        payoutAddress,
      },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/roster");
  revalidatePath("/dashboard");
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

// Persist which payment methods this bandleader actually offers their
// band. Anything not in the list is rendered disabled in every payment
// picker (roster edit, musician self-service, bulk Mark-all-paid). The
// data column is plain TEXT[] so we sanitize against the known method
// values before writing, regardless of what the form sends.
export async function updateEnabledPaymentMethods(formData: FormData) {
  const user = await requireUser();

  const allowedValues = new Set<PaymentMethod>(
    ALL_METHODS.map((m) => m.value),
  );
  const raw = formData.getAll("method").map(String);
  const enabled = raw.filter((v): v is PaymentMethod =>
    allowedValues.has(v as PaymentMethod),
  );

  await db.user.update({
    where: { id: user.id },
    data: { enabledPaymentMethods: enabled },
  });

  // Bust the cache on every page that renders a payment-method dropdown
  // or the bandleader's roster. Settings page itself revalidates so the
  // checkboxes reflect the saved state.
  revalidatePath("/settings");
  revalidatePath("/roster");
  revalidatePath("/my-profile");
}

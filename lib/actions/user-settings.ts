"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ALL_METHODS, type PaymentMethod } from "@/lib/payment-methods";

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

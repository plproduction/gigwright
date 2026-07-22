"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";

// Per-field auto-save for the musician's profile. The old saveMyProfile
// pattern (single Save button, one big formData payload) made musicians
// nervous about losing typing — "did I save?" Auto-save on blur removes
// the question entirely. Each input fires this action with just its own
// field name and value; if anything else has changed on the form it's
// already been written too.
//
// Auth shape mirrors saveMyProfile: requireMusician gives us the signed-
// in user, and we updateMany across every Musician row linked to that
// user (one person can be on multiple bandleader rosters; we keep their
// profile in lockstep).

type EditableField =
  | "email"
  | "phone"
  | "calendarProvider"
  | "paymentMethod"
  | "payoutAddress"
  | "notifyBySms"
  | "w9Received";

const TEXT_FIELDS: ReadonlyArray<EditableField> = [
  "email",
  "phone",
  "payoutAddress",
];

const ENUM_FIELDS: Record<string, ReadonlyArray<string>> = {
  calendarProvider: ["ICLOUD", "GOOGLE", "OUTLOOK", "NONE"],
  paymentMethod: [
    "VENMO",
    "PAYPAL",
    "ZELLE",
    "CASHAPP",
    "CASH",
    "CHECK",
    "DIRECT_DEPOSIT",
    "OTHER",
  ],
};

// notifyByEmail is intentionally NOT editable — gig-coordination email is
// mandatory (always on). Only text (notifyBySms) is an opt-in toggle.
const BOOLEAN_FIELDS: ReadonlyArray<EditableField> = [
  "notifyBySms",
  "w9Received",
];

export async function updateMyProfileField(
  field: EditableField,
  value: string | boolean,
) {
  const user = await requireMusician();

  // Build the {field: parsedValue} payload, validated by field kind.
  // Bad inputs throw — caught client-side and surfaced as a small
  // inline error next to the affected input.
  let data: Record<string, unknown>;
  if (TEXT_FIELDS.includes(field)) {
    if (typeof value !== "string") throw new Error(`Bad value for ${field}`);
    const trimmed = value.trim();
    data = { [field]: trimmed === "" ? null : trimmed };
  } else if (field in ENUM_FIELDS) {
    if (typeof value !== "string") throw new Error(`Bad value for ${field}`);
    const allowed = ENUM_FIELDS[field];
    if (value !== "" && !allowed.includes(value)) {
      throw new Error(`Invalid ${field}: ${value}`);
    }
    data = { [field]: value === "" ? null : value };
  } else if (BOOLEAN_FIELDS.includes(field)) {
    if (typeof value !== "boolean") throw new Error(`Bad value for ${field}`);
    data = { [field]: value };
  } else {
    throw new Error(`Unknown field: ${field}`);
  }

  const result = await db.musician.updateMany({
    where: { userId: user.id },
    data,
  });
  console.log(
    `[updateMyProfileField] userId=${user.id} field=${field} rows=${result.count}`,
  );

  revalidatePath("/my-profile");
  revalidatePath("/roster");
  revalidatePath("/dashboard");
}

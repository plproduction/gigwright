"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { generateIcalToken } from "@/lib/ical";

// Idempotent — returns the user's existing iCal subscription URL if one
// is already minted, otherwise mints a fresh token and persists it.
// Safe to call repeatedly from server components without churning the
// token. Rotation is a separate action (rotateMyIcalUrl).
export async function ensureMyIcalUrl(): Promise<string> {
  const user = await requireUser();
  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";

  if (user.icalToken) {
    return `${baseUrl}/cal/${user.icalToken}`;
  }

  const token = generateIcalToken();
  await db.user.update({
    where: { id: user.id },
    data: { icalToken: token },
  });
  return `${baseUrl}/cal/${token}`;
}

// Mint a fresh token, invalidating the previous URL. Useful if the
// subscription URL leaked (forwarded the email, shared a screenshot,
// etc.). Old subscribers get a 404 and the user has to re-subscribe
// with the new URL.
export async function rotateMyIcalUrl(): Promise<string> {
  const user = await requireUser();
  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";
  const token = generateIcalToken();
  await db.user.update({
    where: { id: user.id },
    data: { icalToken: token },
  });
  return `${baseUrl}/cal/${token}`;
}

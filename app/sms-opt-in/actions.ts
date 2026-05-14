"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CONSENT_TEXT } from "./consent-text";

// CONSENT_TEXT lives in ./consent-text.ts because Next.js "use server"
// modules can only export async functions, not constants. We import it
// here to stamp every opt-in record with the exact wording the user saw.

// Normalize a US phone to E.164 (+15035551234) format. Returns null if
// the input doesn't look like a US 10- or 11-digit phone.
function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Server action invoked by the /sms-opt-in form. Validates inputs,
// records the opt-in with audit metadata, then redirects to the
// success page with a query param the success page uses to confirm
// what got saved.
export async function submitSmsOptIn(formData: FormData) {
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const bandleader = String(formData.get("bandleader") ?? "").trim();
  const consent = formData.get("consent");

  // Hard validation — these would normally show inline errors but the
  // form's required attributes catch the common cases; this is the
  // belt-and-suspenders pass.
  if (!rawPhone) {
    redirect("/sms-opt-in?error=missing-phone");
  }
  if (!name) {
    redirect("/sms-opt-in?error=missing-name");
  }
  if (!consent) {
    redirect("/sms-opt-in?error=missing-consent");
  }

  const phone = normalizeUsPhone(rawPhone);
  if (!phone) {
    redirect("/sms-opt-in?error=invalid-phone");
  }

  // Audit metadata — pull from request headers when available. These
  // are required if a carrier ever disputes whether consent was
  // legitimately collected.
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;

  await db.smsOptIn.create({
    data: {
      phone,
      name: name || null,
      bandleader: bandleader || null,
      consentText: CONSENT_TEXT,
      userAgent,
      ipAddress,
    },
  });

  // Redirect to success with the phone (last-4 only for display) and
  // name so the confirmation page can echo what just happened. We
  // don't pass the full phone in the URL.
  const last4 = phone.slice(-4);
  const params = new URLSearchParams();
  params.set("phone", last4);
  if (name) params.set("name", name);
  redirect(`/sms-opt-in/success?${params.toString()}`);
}

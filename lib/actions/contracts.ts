"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { formatLongDateWithYear, formatTime } from "@/lib/format";
import type { ContractSection } from "@/lib/contracts/boilerplate";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function dollarsToCents(v: FormDataEntryValue | null): number {
  const n = Number.parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Same unguessable-token pattern as Gig.inviteToken / User.icalToken.
async function ensureClientPortalToken(gigId: string): Promise<string> {
  const gig = await db.gig.findUniqueOrThrow({
    where: { id: gigId },
    select: { clientPortalToken: true },
  });
  if (gig.clientPortalToken) return gig.clientPortalToken;
  const token = randomBytes(24).toString("hex");
  await db.gig.update({ where: { id: gigId }, data: { clientPortalToken: token } });
  return token;
}

async function nextContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(2).toString("hex").toUpperCase();
    const candidate = `${year}-${suffix}`;
    const existing = await db.contract.findUnique({ where: { contractNumber: candidate } });
    if (!existing) return candidate;
  }
  // Astronomically unlikely to exhaust 5 attempts at 65k possibilities —
  // fall back to a wider namespace rather than erroring the whole action.
  return `${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// Builds (or regenerates) the DRAFT contract for a gig from its current
// Gig/Venue/Producer/GigPersonnel data, plus the performance-specific
// terms the bandleader fills in on the "Generate contract" form. Terms
// are snapshotted onto the Contract row at this moment — editing the gig
// afterward does NOT change an already-generated contract; regenerate to
// pick up new data (only allowed while still DRAFT, see the UI).
export async function generateContract(gigId: string, formData: FormData) {
  const user = await requireBandleader();

  // Backstop for the letterhead. The panel hides the generate form when
  // this is unset, but a contract whose masthead reads "Your bandleader"
  // is unsendable, so refuse to mint one at the source too.
  if (!user.name && !user.businessName) {
    throw new Error(
      "Set your contract letterhead in Settings before generating an agreement.",
    );
  }

  const gig = await db.gig.findUnique({
    where: { id: gigId, ownerId: user.id },
    include: { venue: true, producer: true },
  });
  if (!gig) throw new Error("Gig not found");

  const existing = await db.contract.findUnique({ where: { gigId } });
  if (existing && existing.status !== "DRAFT") {
    throw new Error(
      "This contract has already been sent or signed — void it before regenerating.",
    );
  }

  const feeCents = dollarsToCents(formData.get("feeDollars"));
  const depositCents = dollarsToCents(formData.get("depositDollars"));
  const balanceCents = Math.max(feeCents - depositCents, 0);

  const performanceWindow =
    nullIfEmpty(formData.get("performanceWindow")) ??
    (gig.endAt
      ? `${formatTime(gig.startAt)} – ${formatTime(gig.endAt)}`
      : formatTime(gig.startAt));

  const program =
    nullIfEmpty(formData.get("program")) ??
    `${user.name ?? "Artist"} — live performance`;

  const purchaserName =
    nullIfEmpty(formData.get("purchaserName")) ?? gig.producer?.name ?? "Purchaser";
  const purchaserEmail = nullIfEmpty(formData.get("purchaserEmail")) ?? gig.producer?.email ?? null;
  const purchaserPhone = nullIfEmpty(formData.get("purchaserPhone")) ?? gig.producer?.phone ?? null;

  let customSections: ContractSection[] = [];
  const rawSections = formData.get("customSectionsJson");
  if (rawSections) {
    try {
      const parsed = JSON.parse(String(rawSections));
      if (Array.isArray(parsed)) customSections = parsed;
    } catch {
      // Malformed JSON from the client — ignore rather than fail the
      // whole generation; the bandleader can add sections after the fact.
    }
  }

  const contractNumber = existing?.contractNumber ?? (await nextContractNumber());
  await ensureClientPortalToken(gigId);

  const data = {
    gigId,
    status: "DRAFT" as const,
    contractNumber,
    purchaserName,
    purchaserEmail,
    purchaserPhone,
    eventName: gig.eventName ?? gig.venue?.name ?? "Live performance",
    venueName: gig.venue?.name ?? nullIfEmpty(formData.get("venueName")) ?? "Venue TBD",
    venueAddress: gig.venue
      ? [gig.venue.addressL1, gig.venue.city, gig.venue.state].filter(Boolean).join(", ")
      : null,
    // Always with the year. formatLongDate drops it, which is a
    // shorthand in a list and a defect on a document somebody signs:
    // every contract generated before 2026-11-22 reads "Friday,
    // December 31" with no year at all.
    eventDateLong: formatLongDateWithYear(gig.startAt),
    performanceWindow,
    program,
    feeCents,
    depositCents,
    balanceCents,
    customSections,
  };

  if (existing) {
    await db.contract.update({ where: { gigId }, data });
  } else {
    await db.contract.create({ data });
  }

  await db.activity.create({
    data: {
      gigId,
      action: "contract_generated",
      summary: `Contract ${contractNumber} generated`,
    },
  });

  revalidatePath(`/gigs/${gigId}`);
}

// Marks the contract SENT (client link is now considered "live") and
// emails the client a link to /c/[token]. Email send is best-effort —
// if AUTH_RESEND_KEY isn't configured (e.g. local dev) the contract still
// flips to SENT so the bandleader can copy the link manually instead.
export async function sendContract(gigId: string) {
  const user = await requireBandleader();
  const gig = await db.gig.findUnique({
    where: { id: gigId, ownerId: user.id },
    include: { contract: true },
  });
  if (!gig?.contract) throw new Error("No contract to send");
  if (!gig.clientPortalToken) throw new Error("Missing client portal token");

  await db.contract.update({
    where: { gigId },
    data: { status: "SENT", sentAt: new Date() },
  });

  const apiKey = process.env.AUTH_RESEND_KEY;
  const to = gig.contract.purchaserEmail;
  if (apiKey && to) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const portalUrl = `${origin}/c/${gig.clientPortalToken}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
        to,
        subject: `Performance agreement · ${gig.contract.eventDateLong}`,
        html: `<p>Hi ${gig.contract.purchaserName},</p><p>Here's the performance agreement for ${gig.contract.eventDateLong}. Please review and sign at the link below.</p><p><a href="${portalUrl}">${portalUrl}</a></p>`,
        text: `Here's the performance agreement for ${gig.contract.eventDateLong}. Review and sign: ${portalUrl}`,
      }),
    }).catch(() => {
      // Swallow — the DB state (SENT) is the source of truth; a failed
      // send just means the bandleader needs to share the link manually.
    });
  }

  await db.activity.create({
    data: { gigId, action: "contract_sent", summary: "Contract sent to client" },
  });

  revalidatePath(`/gigs/${gigId}`);
}

// Public action — called from /c/[token], no bandleader session. The
// token itself is the auth: anyone with the unguessable link can view and
// sign, same trust model as the musician RSVP links.
export async function signContract(token: string, formData: FormData) {
  const gig = await db.gig.findUnique({
    where: { clientPortalToken: token },
    include: { contract: true },
  });
  if (!gig?.contract) throw new Error("Contract not found");
  if (gig.contract.status === "SIGNED") return; // idempotent re-submit guard
  // A voided agreement has been superseded or cancelled — the old link
  // may still be sitting in the client's inbox, and signing it would
  // produce a signed contract the bandleader has already walked away
  // from. Refuse rather than silently accept.
  if (gig.contract.status === "VOID") {
    throw new Error("This agreement is no longer valid — ask for an updated copy.");
  }

  const signerName = nullIfEmpty(formData.get("signerName"));
  const signatureDataUrl = String(formData.get("signatureDataUrl") ?? "");
  if (!signerName) throw new Error("Type your name to sign");
  // A blank canvas still produces a tiny PNG (transparent, ~70-100 bytes
  // as base64) — require a meaningfully larger payload as a cheap signal
  // that something was actually drawn, without parsing pixel data.
  if (signatureDataUrl.length < 400) throw new Error("Draw your signature to sign");

  const h = await headers();
  const signerIp =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  await db.contract.update({
    where: { gigId: gig.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signerName,
      signerEmail: nullIfEmpty(formData.get("signerEmail")),
      signerIp,
      signatureDataUrl,
    },
  });

  await db.activity.create({
    data: {
      gigId: gig.id,
      action: "contract_signed",
      summary: `Signed by ${signerName}`,
    },
  });

  revalidatePath(`/c/${token}`);
  revalidatePath(`/gigs/${gig.id}`);
}

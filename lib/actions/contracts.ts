"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { formatLongDateWithYear, formatTime } from "@/lib/format";
import type { ContractSection } from "@/lib/contracts/boilerplate";
import { sendClientPortalEmail } from "@/lib/notify-client-portal";

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

const PIECE_WORDS = [
  "", "solo", "two-piece", "three-piece", "four-piece", "five-piece",
  "six-piece", "seven-piece", "eight-piece", "nine-piece", "ten-piece",
  "eleven-piece", "twelve-piece",
];

// What the contract says the client is buying.
//
// Patrick, 2026-11-22: "on the contract, I may just say six piece. I
// don't want to put every specific thing on there because it's more
// legally binding for me, the contractor."
//
// So this describes a CONFIGURATION and never names a musician. The
// lineup is the right source for it — Lineup.sizeLabel ("6 Piece") and
// Lineup.description exist precisely for the client-facing half, and
// the lineup is the layer that doesn't change when you sub someone in
// on the Thursday. GigPersonnel is staffing and stays out of this.
//
// It's a default, not a rule. Whatever comes back lands in an editable
// field on the generate form: a gig with no lineup, or a one-off that
// doesn't match any lineup, is typed over. See PERSONNEL & SUBSTITUTION
// in the boilerplate for the clause that makes the swap safe.
export async function defaultProgramLine(
  gigId: string,
  artist: string,
): Promise<string> {
  const applied = await db.activity.findFirst({
    where: { gigId, action: "lineup_applied" },
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });
  const p = (applied?.payload ?? {}) as {
    lineupId?: string;
    undoneAt?: string | null;
  };

  if (p.lineupId && !p.undoneAt) {
    const lineup = await db.lineup.findUnique({
      where: { id: p.lineupId },
      select: { name: true, sizeLabel: true, description: true },
    });
    if (lineup) {
      const size = lineup.sizeLabel?.trim() || lineup.name;
      const head = `${artist} — ${size}`;
      return lineup.description?.trim()
        ? `${head}. ${lineup.description.trim()}`
        : head;
    }
  }

  // No lineup on this gig: fall back to the size of the band actually
  // booked. Still a count, still no names.
  const n = await db.gigPersonnel.count({ where: { gigId } });
  if (n >= 2) {
    const word = PIECE_WORDS[n] ?? `${n}-piece`;
    return `${artist} — ${word} band`;
  }
  return `${artist} — live performance`;
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
    (await defaultProgramLine(gigId, user.name ?? "Artist"));

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
  // Patrick 2026-11-23: after clicking Generate, open the document so
  // he can see it, review it, and decide to send or edit. Previously
  // this left him staring at a tiny updated panel with no visible
  // output — "goes nowhere, does nothing." The redirect goes outside
  // the try so the DB write is already committed before we throw the
  // NEXT_REDIRECT internal exception.
  redirect(`/gigs/${gigId}/contract`);
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

  // Flip the status FIRST so the DB is the source of truth even if
  // the email has trouble. The admin can still copy the client link
  // manually from the preview page in that case.
  await db.contract.update({
    where: { gigId },
    data: { status: "SENT", sentAt: new Date() },
  });

  const to = gig.contract.purchaserEmail;
  const bandleaderName =
    user.name ?? user.businessName ?? user.email ?? "GigWright";

  let emailError: string | null = null;
  if (to) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const portalUrl = `${origin}/c/${gig.clientPortalToken}`;
    const firstName = gig.contract.purchaserName.split(/\s+/)[0] ?? "there";
    const result = await sendClientPortalEmail({
      to,
      bandleaderName,
      bandleaderReplyEmail: user.email ?? null,
      subject: `Performance agreement · ${gig.contract.eventDateLong}`,
      text: `Hi ${firstName},

Here's the performance agreement for ${gig.contract.eventDateLong}. Please review and sign at the link below — no account needed, just click and sign.

${portalUrl}

Reply to this email with any questions.

— ${bandleaderName}
`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
    <p style="margin:0 0 12px 0;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:#3A3833;">Here's the performance agreement for <strong>${escapeHtml(gig.contract.eventDateLong)}</strong>. Please review and sign at the link below — no account needed, just click and sign.</p>
    <div style="margin:24px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#7E2418;color:#FFFFFF;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Review &amp; sign the agreement</a>
    </div>
    <p style="margin:16px 0 0 0;font-size:13px;color:#3A3833;">Reply to this email with any questions.</p>
    <p style="margin:24px 0 0 0;font-size:14px;color:#0E0C09;">— ${escapeHtml(bandleaderName)}</p>
  </div>
</body></html>`,
    });
    if (!result.ok) emailError = result.error;
  }

  await db.activity.create({
    data: {
      gigId,
      action: "contract_sent",
      summary: emailError
        ? `Contract sent — email failed (${emailError.slice(0, 80)})`
        : to
          ? "Contract sent to client"
          : "Contract marked sent (no purchaser email on file)",
    },
  });

  revalidatePath(`/gigs/${gigId}`);
  // Surface the email failure so the admin knows to share the link
  // manually. The status is already SENT, so a resend from the admin
  // preview will retry the email.
  if (emailError) {
    throw new Error(
      `Contract status set to SENT, but the email failed: ${emailError}. Copy the client link from the preview page and send it manually, or retry.`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";

function dollarsToCents(v: FormDataEntryValue | null): number {
  const n = Number.parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(2).toString("hex").toUpperCase();
    const candidate = `INV-${year}-${suffix}`;
    const existing = await db.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!existing) return candidate;
  }
  return `INV-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function ensureClientPortalToken(gigId: string): Promise<void> {
  const gig = await db.gig.findUniqueOrThrow({
    where: { id: gigId },
    select: { clientPortalToken: true },
  });
  if (!gig.clientPortalToken) {
    await db.gig.update({
      where: { id: gigId },
      data: { clientPortalToken: randomBytes(24).toString("hex") },
    });
  }
}

// Line items arrive as parallel form arrays: description[], qty[], rate[].
// One flat invoice per gig (see Invoice model comment) — regenerating
// replaces every line item rather than trying to diff/merge them, which
// keeps this action (and the form building it) simple. Only safe while
// DRAFT; a SENT/PAID invoice must be voided and a new one generated,
// same rule as Contract.
export async function generateInvoice(gigId: string, formData: FormData) {
  const user = await requireBandleader();
  const gig = await db.gig.findUnique({
    where: { id: gigId, ownerId: user.id },
    include: { venue: { select: { name: true } } },
  });
  if (!gig) throw new Error("Gig not found");

  const existing = await db.invoice.findUnique({ where: { gigId } });
  if (existing && existing.status !== "DRAFT") {
    throw new Error("This invoice has already been sent — void it before regenerating.");
  }

  const descriptions = formData.getAll("lineDescription").map(String);
  const qtys = formData.getAll("lineQty").map((v) => Math.max(1, Number.parseInt(String(v), 10) || 1));
  const rates = formData.getAll("lineRate").map(dollarsToCents);

  let lineItems = descriptions
    .map((description, i) => ({
      description: description.trim(),
      qty: qtys[i] ?? 1,
      rateCents: rates[i] ?? 0,
      amountCents: (qtys[i] ?? 1) * (rates[i] ?? 0),
      position: i,
    }))
    .filter((li) => li.description.length > 0);

  // Fallback: if the form came back with no usable lines but the gig
  // itself has a client pay amount, synthesize one sensible line so
  // the invoice doesn't render $0 across the board. Patrick's bug
  // 2026-11-23: "Showing up all zero."
  if (lineItems.length === 0 && gig.clientPayCents) {
    const date = gig.startAt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    lineItems = [
      {
        description: `Performance on ${date}${gig.venue?.name ? ` at ${gig.venue.name}` : ""}`,
        qty: 1,
        rateCents: gig.clientPayCents,
        amountCents: gig.clientPayCents,
        position: 0,
      },
    ];
  }

  const subtotalCents = lineItems.reduce((sum, li) => sum + li.amountCents, 0);
  const discountCents = dollarsToCents(formData.get("discountDollars"));
  const taxCents = dollarsToCents(formData.get("taxDollars"));
  const totalCents = Math.max(subtotalCents - discountCents + taxCents, 0);
  const depositDueCents = dollarsToCents(formData.get("depositDueDollars"));
  const messageOnInvoice = String(formData.get("messageOnInvoice") ?? "").trim() || null;
  // <input type="date"> gives "YYYY-MM-DD"; new Date() reads that as UTC
  // midnight, which is what InvoiceDocument formats back in UTC. Keep
  // both ends on UTC so the date shown is the date typed.
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateRaw ? new Date(`${dueDateRaw}T00:00:00Z`) : null;

  const invoiceNumber = existing?.invoiceNumber ?? (await nextInvoiceNumber());
  await ensureClientPortalToken(gigId);

  if (existing) {
    await db.invoiceLineItem.deleteMany({ where: { invoiceId: existing.id } });
    await db.invoice.update({
      where: { gigId },
      data: {
        invoiceNumber,
        subtotalCents,
        taxCents,
        discountCents,
        totalCents,
        depositDueCents,
        messageOnInvoice,
        dueDate,
        lineItems: { create: lineItems },
      },
    });
  } else {
    await db.invoice.create({
      data: {
        gigId,
        invoiceNumber,
        subtotalCents,
        taxCents,
        discountCents,
        totalCents,
        depositDueCents,
        messageOnInvoice,
        dueDate,
        lineItems: { create: lineItems },
      },
    });
  }

  await db.activity.create({
    data: { gigId, action: "invoice_generated", summary: `Invoice ${invoiceNumber} generated` },
  });

  revalidatePath(`/gigs/${gigId}`);
  // Patrick 2026-11-23: open the invoice after Generate so the admin
  // can see what was made and decide to send/edit/record payment,
  // same rule as contracts above.
  redirect(`/gigs/${gigId}/invoice`);
}

export async function sendInvoice(gigId: string) {
  const user = await requireBandleader();
  const gig = await db.gig.findUnique({ where: { id: gigId, ownerId: user.id } });
  if (!gig) throw new Error("Gig not found");

  await db.invoice.update({
    where: { gigId },
    data: { status: "SENT" },
  });

  await db.activity.create({
    data: { gigId, action: "invoice_sent", summary: "Invoice sent to client" },
  });

  revalidatePath(`/gigs/${gigId}`);
}

// Manual "mark paid" for now — stands in for the PayPal capture webhook
// until a bandleader links a real PayPal address (User.paypalEmail) and
// the PayPal Buttons SDK is wired on /c/[token]. Lets a bandleader record
// a check/Zelle/cash payment against the invoice either way, which real
// bandleaders will need regardless of PayPal.
export async function recordInvoicePayment(gigId: string, amountDollars: FormDataEntryValue | null) {
  const user = await requireBandleader();
  const gig = await db.gig.findUnique({
    where: { id: gigId, ownerId: user.id },
    include: { invoice: true },
  });
  if (!gig?.invoice) throw new Error("No invoice on this gig");

  const amountCents = dollarsToCents(amountDollars);
  const paidCents = Math.min(gig.invoice.paidCents + amountCents, gig.invoice.totalCents);
  const isPaidInFull = paidCents >= gig.invoice.totalCents;

  await db.invoice.update({
    where: { gigId },
    data: {
      paidCents,
      paidAt: isPaidInFull ? new Date() : gig.invoice.paidAt,
      // Only stamp a deposit date when a deposit was actually required —
      // otherwise `paidCents >= 0` is trivially true and every invoice
      // without a deposit reports one as paid.
      depositPaidAt:
        gig.invoice.depositPaidAt ??
        (gig.invoice.depositDueCents > 0 && paidCents >= gig.invoice.depositDueCents
          ? new Date()
          : null),
      status: isPaidInFull ? "PAID" : "PARTIALLY_PAID",
    },
  });

  await db.activity.create({
    data: {
      gigId,
      action: "invoice_payment_recorded",
      summary: `Payment of $${(amountCents / 100).toFixed(2)} recorded`,
    },
  });

  revalidatePath(`/gigs/${gigId}`);
}

"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { sendClientPortalEmail } from "@/lib/notify-client-portal";

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
  const gig = await db.gig.findUnique({
    where: { id: gigId, ownerId: user.id },
    include: {
      invoice: true,
      contract: { select: { purchaserName: true, purchaserEmail: true } },
    },
  });
  if (!gig) throw new Error("Gig not found");
  if (!gig.invoice) throw new Error("No invoice on this gig to send");
  if (!gig.clientPortalToken)
    throw new Error("Missing client portal token — regenerate the invoice first");

  await db.invoice.update({
    where: { gigId },
    data: { status: "SENT" },
  });

  // Patrick 2026-11-23: "Make sure the emails go out correctly on the
  // server." sendInvoice previously only updated DB status and sent
  // NOTHING to the client. Now mirrors sendContract: personal note
  // with a big link to the client portal where they see the invoice
  // (and the contract if there is one) in the Ritz-Carlton layout.
  const to = gig.contract?.purchaserEmail ?? null;
  const purchaserName = gig.contract?.purchaserName ?? "there";
  const bandleaderName =
    user.name ?? user.businessName ?? user.email ?? "GigWright";
  const dollars = (c: number) => (c / 100).toFixed(2);
  const totalDisplay = dollars(gig.invoice.totalCents);
  const balanceCents = gig.invoice.totalCents - gig.invoice.paidCents;
  const balanceDisplay = dollars(balanceCents);

  let emailError: string | null = null;
  if (to) {
    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const portalUrl = `${origin}/c/${gig.clientPortalToken}`;
    const firstName = purchaserName.split(/\s+/)[0] ?? "there";
    const result = await sendClientPortalEmail({
      to,
      bandleaderName,
      bandleaderReplyEmail: user.email ?? null,
      subject: `Invoice ${gig.invoice.invoiceNumber} · $${totalDisplay}`,
      text: `Hi ${firstName},

Here is invoice ${gig.invoice.invoiceNumber} for $${totalDisplay}${balanceCents < gig.invoice.totalCents ? ` ($${balanceDisplay} remaining)` : ""}.

${portalUrl}

Reply to this email with any questions.

— ${bandleaderName}
`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
    <p style="margin:0 0 12px 0;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:#3A3833;">Here is <strong>invoice ${escapeHtml(gig.invoice.invoiceNumber)}</strong> for <strong style="color:#7E2418;">$${escapeHtml(totalDisplay)}</strong>${balanceCents < gig.invoice.totalCents ? ` <span style="color:#7A776E;">(balance due $${escapeHtml(balanceDisplay)})</span>` : ""}.</p>
    <div style="margin:24px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#7E2418;color:#FFFFFF;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View the invoice</a>
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
      action: "invoice_sent",
      summary: emailError
        ? `Invoice sent — email failed (${emailError.slice(0, 80)})`
        : to
          ? "Invoice sent to client"
          : "Invoice marked sent (no purchaser email on file — share the client link manually)",
    },
  });

  revalidatePath(`/gigs/${gigId}`);
  if (emailError) {
    throw new Error(
      `Invoice status set to SENT, but the email failed: ${emailError}. Copy the client link from the preview page and send it manually, or retry.`,
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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { sendInvoice, recordInvoicePayment } from "@/lib/actions/invoices";
import { InvoiceDocument } from "@/components/contracts/InvoiceDocument";
import { CopyLinkButton } from "@/components/contracts/CopyLinkButton";

// Admin preview of the invoice. Mirrors the contract preview — same
// Ritz-Carlton paper, same admin action bar. Patrick's rule
// 2026-11-23: generateInvoice should take the admin straight here
// so he can see what was made, not leave him staring at an updated
// panel with no visible document.
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireBandleader();
  const { id } = await params;

  const gig = await db.gig.findFirst({
    where: { id, ownerId: user.id },
    include: {
      contract: { select: { purchaserName: true } },
      invoice: { include: { lineItems: { orderBy: { position: "asc" } } } },
      owner: {
        select: {
          name: true,
          email: true,
          businessName: true,
          paypalEmail: true,
        },
      },
    },
  });
  if (!gig) notFound();
  if (!gig.invoice) redirect(`/gigs/${id}#paperwork`);

  const businessName =
    gig.owner.businessName ?? gig.owner.name ?? gig.owner.email;
  const purchaserName = gig.contract?.purchaserName ?? "Client";

  const portalUrl = gig.clientPortalToken
    ? `/c/${gig.clientPortalToken}`
    : null;
  const boundSend = sendInvoice.bind(null, id);
  // recordInvoicePayment takes (gigId, amount) — bind gigId so the
  // inline form can just pass the amount FormDataEntryValue. Keeping
  // this at the top of the component rather than inline avoids the
  // Next 16 "closure-captured inline use-server action" footgun that
  // Patrick hit 2026-11-23 (invoice preview wasn't rendering).
  const boundRecordPayment = async (formData: FormData) => {
    "use server";
    await recordInvoicePayment(id, formData.get("amount"));
  };

  const isDraft = gig.invoice.status === "DRAFT";
  const isSent = gig.invoice.status === "SENT";
  const isPaid = gig.invoice.status === "PAID";
  const isPartial = gig.invoice.status === "PARTIALLY_PAID";
  const balanceDueCents = gig.invoice.totalCents - gig.invoice.paidCents;

  return (
    <div className="min-h-screen bg-paper-warm/30">
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[840px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Admin preview · what the client will see
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2 text-[13px]">
              <span className="font-serif text-ink">
                Invoice {gig.invoice.invoiceNumber}
              </span>
              <StatusBadge status={gig.invoice.status} />
              <span className="text-ink-mute">
                · ${(gig.invoice.totalCents / 100).toFixed(2)} total
                {balanceDueCents > 0 && (
                  <>
                    {" · "}
                    <span className="text-accent">
                      ${(balanceDueCents / 100).toFixed(2)} due
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/gigs/${id}`}
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent"
            >
              ← Back to gig
            </Link>
            {isDraft && (
              <Link
                href={`/gigs/${id}#paperwork`}
                className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent"
              >
                Edit
              </Link>
            )}
            {portalUrl && (
              <CopyLinkButton
                url={portalUrl}
                label="Copy client link"
                copiedLabel="✓ Copied"
                className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent"
              />
            )}
            {(isDraft || isSent) && (
              <form action={boundSend}>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-[#611B11]"
                >
                  {isSent ? "Resend to client" : "Send invoice to client"}
                </button>
              </form>
            )}
          </div>
        </div>
        {/* Record payment — only meaningful once the invoice is out
            to the client. Keeps the action within reach while the
            admin is looking at the paid/unpaid totals. */}
        {(isSent || isPartial) && balanceDueCents > 0 && (
          <form
            action={boundRecordPayment}
            className="mx-auto mt-2 flex max-w-[840px] flex-wrap items-center justify-end gap-2 border-t border-line pt-2"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Record payment received
            </span>
            <input
              name="amount"
              placeholder={`${(balanceDueCents / 100).toFixed(2)}`}
              inputMode="decimal"
              className="w-24 rounded-md border border-line-strong bg-paper px-2 py-1 text-[12px] text-ink"
            />
            <button
              type="submit"
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent"
            >
              Record
            </button>
          </form>
        )}
      </div>

      <div className="mx-auto max-w-[760px] py-10">
        <div className="overflow-hidden rounded-lg border border-contract-rule bg-contract-paper shadow-sm">
          <InvoiceDocument
            invoice={gig.invoice}
            businessName={businessName}
            purchaserName={purchaserName}
            payButtonSlot={
              isPaid ? (
                <div className="rounded-md bg-success/10 p-4 text-center font-sans text-[12px] text-success">
                  ✓ Paid in full
                </div>
              ) : gig.owner.paypalEmail ? (
                <div className="rounded-md bg-contract-gold/10 p-4 text-center font-sans text-[12px] text-contract-soft">
                  Online payment is coming soon — {businessName} will follow up
                  with payment instructions.
                </div>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-ink-mute/10 text-ink-mute",
  SENT: "bg-warn/10 text-warn",
  PARTIALLY_PAID: "bg-warn/10 text-warn",
  PAID: "bg-success/10 text-success",
  VOID: "bg-ink-mute/10 text-ink-mute line-through",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLES[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

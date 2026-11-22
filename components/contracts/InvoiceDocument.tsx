import type { Invoice, InvoiceLineItem } from "@/lib/generated/prisma/client";
import { centsToDisplay } from "@/lib/contracts/boilerplate";

type InvoiceDocumentProps = {
  invoice: Invoice & { lineItems: InvoiceLineItem[] };
  businessName: string;
  purchaserName: string;
  payButtonSlot?: React.ReactNode;
};

export function InvoiceDocument({
  invoice,
  businessName,
  purchaserName,
  payButtonSlot,
}: InvoiceDocumentProps) {
  const balanceDue = invoice.totalCents - invoice.paidCents;

  return (
    <div className="bg-contract-paper px-6 py-10 sm:px-10 md:px-16">
      <div className="mx-auto max-w-[640px]">
        <div className="flex items-start justify-between border-b border-contract-rule pb-5">
          <div>
            <div className="font-sans text-[9px] tracking-[0.2em] text-contract-gold uppercase">
              Bill from
            </div>
            <div className="font-contract-serif mt-1 text-[16px] text-contract-ink">{businessName}</div>
          </div>
          <div className="text-right">
            <h2 className="font-contract-serif text-[22px] text-contract-ink">Invoice</h2>
            <div className="mt-1 font-sans text-[11px] text-contract-soft">
              {invoice.invoiceNumber}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-start justify-between">
          <div>
            <div className="font-sans text-[9px] tracking-[0.2em] text-contract-gold uppercase">
              Bill to
            </div>
            <div className="font-contract-serif mt-1 text-[15px] text-contract-ink">{purchaserName}</div>
          </div>
          {invoice.dueDate && (
            <div className="text-right">
              <div className="font-sans text-[9px] tracking-[0.2em] text-contract-soft uppercase">
                Due date
              </div>
              <div className="mt-1 font-sans text-[13px] text-contract-ink">
                {/* Date-only value stored as UTC midnight — format in UTC
                    or every bandleader west of Greenwich sees the day
                    before the one they typed. */}
                {invoice.dueDate.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </div>
            </div>
          )}
        </div>

        <table className="mt-7 w-full border-collapse">
          <thead>
            <tr className="border-b border-contract-ink/60">
              <th className="pb-2 text-left font-sans text-[9px] tracking-[0.16em] text-contract-soft uppercase">
                Item &amp; description
              </th>
              <th className="pb-2 text-right font-sans text-[9px] tracking-[0.16em] text-contract-soft uppercase">
                Qty
              </th>
              <th className="pb-2 text-right font-sans text-[9px] tracking-[0.16em] text-contract-soft uppercase">
                Rate
              </th>
              <th className="pb-2 text-right font-sans text-[9px] tracking-[0.16em] text-contract-soft uppercase">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-contract-rule">
                <td className="py-3 pr-3 font-sans text-[12.5px] text-contract-ink">{li.description}</td>
                <td className="py-3 text-right font-sans text-[12.5px] text-contract-ink">{li.qty}</td>
                <td className="py-3 text-right font-sans text-[12.5px] text-contract-ink">
                  {centsToDisplay(li.rateCents)}
                </td>
                <td className="py-3 text-right font-sans text-[12.5px] text-contract-ink">
                  {centsToDisplay(li.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-[260px] space-y-1.5">
          <div className="flex justify-between font-sans text-[12px] text-contract-soft">
            <span>Subtotal</span>
            <span className="text-contract-ink">{centsToDisplay(invoice.subtotalCents)}</span>
          </div>
          {invoice.discountCents > 0 && (
            <div className="flex justify-between font-sans text-[12px] text-contract-soft">
              <span>Discount</span>
              <span className="text-contract-ink">&minus;{centsToDisplay(invoice.discountCents)}</span>
            </div>
          )}
          {invoice.taxCents > 0 && (
            <div className="flex justify-between font-sans text-[12px] text-contract-soft">
              <span>Tax</span>
              <span className="text-contract-ink">{centsToDisplay(invoice.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-contract-ink/60 pt-1.5 font-sans text-[13px] font-medium text-contract-ink">
            <span>Total</span>
            <span>{centsToDisplay(invoice.totalCents)}</span>
          </div>
          {invoice.paidCents > 0 && (
            <div className="flex justify-between font-sans text-[12px] text-contract-soft">
              <span>Paid</span>
              <span className="text-contract-ink">{centsToDisplay(invoice.paidCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-contract-serif text-[16px] text-contract-ink">
            <span>Balance due</span>
            <span>{centsToDisplay(balanceDue)}</span>
          </div>
        </div>

        {invoice.messageOnInvoice && (
          <p className="mt-6 border-t border-contract-rule pt-4 font-sans text-[12px] leading-[1.6] text-contract-soft">
            {invoice.messageOnInvoice}
          </p>
        )}

        {balanceDue > 0 && payButtonSlot && <div className="mt-7">{payButtonSlot}</div>}
      </div>
    </div>
  );
}

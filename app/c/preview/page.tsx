import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contracts/ContractDocument";
import { InvoiceDocument } from "@/components/contracts/InvoiceDocument";
import { SignaturePad } from "@/components/contracts/SignaturePad";

// Dev-only design preview for the client-facing documents. Renders the
// real components with sample data so the letterhead can be eyeballed
// without a database or a live gig. 404s in production.
export const dynamic = "force-dynamic";

const SAMPLE_CONTRACT = {
  id: "preview",
  gigId: "preview",
  status: "SENT" as const,
  contractNumber: "2027-7911",
  purchaserName: "Julie Brennan",
  purchaserEmail: "brennanjulie9@example.com",
  purchaserPhone: "(949) 533-0909",
  eventName: "Brennan Wedding Welcome Party — Private Event",
  venueName: "The Brazilian Court Hotel",
  venueAddress: "301 Australian Avenue, Palm Beach, FL 33480",
  eventDateLong: "January 29th, 2027 (Friday)",
  performanceWindow: "7:00 PM – 9:00 PM (two hours)",
  program: "Patrick Lamb — Saxophone, with one (1) accompanist to be announced",
  feeCents: 100000,
  depositCents: 50000,
  balanceCents: 50000,
  customSections: [
    {
      title: "PERFORMANCE REQUIREMENTS",
      body: [
        "Artist shall perform live on saxophone on January 29th, 2027, from 7:00 PM to 9:00 PM, for a total performance time of two (2) hours, which may include one (1) short break at Artist's discretion.",
        "Artist shall provide a compact professional sound system appropriate for a duo performance and the expected guest count. Purchaser shall arrange with the venue a level performance area of adequate size, with access to standard electrical power within twenty-five (25) feet.",
      ],
    },
    {
      title: "CANCELLATION & FORCE MAJEURE",
      body: [
        "In the event of cancellation by Purchaser, the deposit shall be retained by Artist as liquidated damages and shall not be refundable. Cancellation by Purchaser within thirty (30) days of the performance date shall obligate Purchaser to pay the full contracted fee.",
      ],
    },
  ],
  sentAt: new Date(),
  signedAt: null,
  signerName: null,
  signerEmail: null,
  signerIp: null,
  signatureDataUrl: null,
  pdfUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_INVOICE = {
  id: "preview",
  gigId: "preview",
  status: "SENT" as const,
  invoiceNumber: "INV-2027-0041",
  subtotalCents: 100000,
  taxCents: 0,
  discountCents: 0,
  totalCents: 100000,
  depositDueCents: 50000,
  depositPaidAt: null,
  paidCents: 0,
  paidAt: null,
  dueDate: new Date("2027-01-15"),
  messageOnInvoice:
    "Deposit of $500.00 confirms the date. Balance due immediately following the performance.",
  paypalOrderId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lineItems: [
    {
      id: "li1",
      invoiceId: "preview",
      description: "Live performance — saxophone duo, two hours",
      qty: 1,
      rateCents: 100000,
      amountCents: 100000,
      position: 0,
    },
  ],
};

export default function ContractPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen bg-contract-paper">
      <div className="mx-auto max-w-[760px] py-10">
        <section className="mb-10 overflow-hidden rounded-lg border border-contract-rule shadow-sm">
          <ContractDocument
            contract={SAMPLE_CONTRACT}
            bandleaderName="Patrick Lamb"
            businessName="Patrick Lamb Productions"
            address="3610 South Ocean Boulevard · Palm Beach, Florida 33480"
            email="patrick@patricklamb.com"
            phone="503.267.4826"
            signatureSlot={<SignaturePad fieldName="preview" />}
          />
        </section>
        <section className="overflow-hidden rounded-lg border border-contract-rule shadow-sm">
          <InvoiceDocument
            invoice={SAMPLE_INVOICE}
            businessName="Patrick Lamb Productions"
            purchaserName="Julie Brennan"
          />
        </section>
      </div>
    </main>
  );
}

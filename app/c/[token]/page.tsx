import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { signContract } from "@/lib/actions/contracts";
import { ContractDocument } from "@/components/contracts/ContractDocument";
import { InvoiceDocument } from "@/components/contracts/InvoiceDocument";
import { SignForm } from "@/components/contracts/SignForm";

// Public client portal — one unguessable link per gig (Gig.clientPortalToken)
// showing the contract and invoice together, same unified-link pattern as
// Back On Stage's Client Portal (one URL for both documents rather than
// separate contract/invoice links). No login: the token is the access
// control, same trust model as the musician RSVP links elsewhere in the app.
export const dynamic = "force-dynamic";

type Params = { token: string };

export default async function ClientPortalPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;

  const gig = await db.gig.findUnique({
    where: { clientPortalToken: token },
    include: {
      contract: true,
      invoice: { include: { lineItems: { orderBy: { position: "asc" } } } },
      owner: {
        select: {
          name: true,
          email: true,
          businessName: true,
          businessAddress: true,
          businessPhone: true,
          paypalEmail: true,
        },
      },
    },
  });

  if (!gig || (!gig.contract && !gig.invoice)) notFound();

  const bandleaderName = gig.owner.name ?? "Your bandleader";
  const businessName = gig.owner.businessName ?? bandleaderName;
  const address = gig.owner.businessAddress ?? "";
  const phone = gig.owner.businessPhone ?? "";
  const email = gig.owner.email;

  const boundSign = signContract.bind(null, token);

  return (
    <main className="min-h-screen bg-contract-paper">
      <div className="mx-auto max-w-[760px] py-10">
        {gig.contract && (
          <section className="mb-10 overflow-hidden rounded-lg border border-contract-rule shadow-sm">
            <ContractDocument
              contract={gig.contract}
              bandleaderName={bandleaderName}
              businessName={businessName}
              address={address}
              email={email}
              phone={phone}
              signatureSlot={
                gig.contract.status === "SIGNED" ? (
                  <div>
                    {gig.contract.signatureDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gig.contract.signatureDataUrl}
                        alt={`${gig.contract.signerName}'s signature`}
                        className="h-[70px] object-contain object-left"
                      />
                    )}
                    <div className="mt-1 h-px bg-contract-ink" />
                    <div className="mt-1 font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
                      Signed by {gig.contract.signerName} &middot;{" "}
                      {gig.contract.signedAt?.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                ) : (
                  <SignForm action={boundSign} defaultEmail={gig.contract.purchaserEmail} />
                )
              }
            />
          </section>
        )}

        {gig.invoice && (
          <section className="overflow-hidden rounded-lg border border-contract-rule shadow-sm">
            <InvoiceDocument
              invoice={gig.invoice}
              businessName={businessName}
              purchaserName={gig.contract?.purchaserName ?? "Client"}
              payButtonSlot={
                gig.owner.paypalEmail ? (
                  <div className="rounded-md bg-contract-gold/10 p-4 text-center font-sans text-[12px] text-contract-soft">
                    Online payment is coming soon &mdash; {businessName} will follow up with
                    payment instructions.
                  </div>
                ) : undefined
              }
            />
          </section>
        )}
      </div>
    </main>
  );
}

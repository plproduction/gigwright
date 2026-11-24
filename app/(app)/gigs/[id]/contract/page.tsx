import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { sendContract } from "@/lib/actions/contracts";
import { ContractDocument } from "@/components/contracts/ContractDocument";
import { CopyLinkButton } from "@/components/contracts/CopyLinkButton";

// Admin preview of the performance agreement. Renders the same
// ContractDocument the client sees on /c/[token] — Ritz-Carlton
// letterhead, roman-numeral sections, gold rules — with an admin
// action bar on top so Patrick can review, send, copy the client
// link, or go back to the gig page.
//
// Patrick's rule 2026-11-23: after clicking "Generate" he expects
// the document to OPEN so he can see it, edit it, or send it. The
// generateContract server action now redirects here instead of
// silently revalidating the gig page.
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function ContractPreviewPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireBandleader();
  const { id } = await params;

  const gig = await db.gig.findFirst({
    where: { id, ownerId: user.id },
    include: {
      contract: true,
      owner: {
        select: {
          name: true,
          email: true,
          businessName: true,
          businessAddress: true,
          businessPhone: true,
        },
      },
    },
  });
  if (!gig) notFound();
  // No contract yet → bounce back to the gig page where the form is.
  // Prevents landing on a blank "preview" with nothing to preview.
  if (!gig.contract) redirect(`/gigs/${id}#paperwork`);

  const bandleaderName = gig.owner.name ?? gig.owner.businessName ?? gig.owner.email;
  const businessName = gig.owner.businessName ?? gig.owner.name ?? gig.owner.email;
  const address = gig.owner.businessAddress ?? "";
  const phone = gig.owner.businessPhone ?? "";
  const email = gig.owner.email;

  const portalUrl = gig.clientPortalToken
    ? `/c/${gig.clientPortalToken}`
    : null;
  const boundSend = sendContract.bind(null, id);

  const isDraft = gig.contract.status === "DRAFT";
  const isSent = gig.contract.status === "SENT";
  const isSigned = gig.contract.status === "SIGNED";

  return (
    <div className="min-h-screen bg-paper-warm/30">
      {/* Admin action bar — sticks to top so Send / Edit / Copy are
          always reachable while scrolling a long contract. */}
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[840px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Admin preview · what the client will see
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2 text-[13px]">
              <span className="font-serif text-ink">
                Contract N° {gig.contract.contractNumber}
              </span>
              <StatusBadge status={gig.contract.status} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/gigs/${id}`}
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent"
            >
              ← Back to gig
            </Link>
            {/* Edit is just "scroll back down to the form on the gig
                page" — the form is the source of truth. A dedicated
                edit route would be more code without more value. */}
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
                  {isSent ? "Resend to client" : "Send to client for signature"}
                </button>
              </form>
            )}
            {isSigned && (
              <span className="text-[12px] italic text-success">
                ✓ Signed{" "}
                {gig.contract.signedAt?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Document itself, same layout as /c/[token] so what the
          bandleader reviews is byte-identical to what the client
          will open. */}
      <div className="mx-auto max-w-[760px] py-10">
        <div className="overflow-hidden rounded-lg border border-contract-rule bg-contract-paper shadow-sm">
          <ContractDocument
            contract={gig.contract}
            bandleaderName={bandleaderName}
            businessName={businessName}
            address={address}
            email={email}
            phone={phone}
            signatureSlot={
              isSigned ? (
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
                  <div className="mt-1 font-sans text-[9px] uppercase tracking-[0.18em] text-contract-soft">
                    Signed by {gig.contract.signerName} ·{" "}
                    {gig.contract.signedAt?.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-contract-rule bg-contract-paper/60 p-4 text-center font-sans text-[11px] uppercase tracking-[0.16em] text-contract-soft">
                  Awaiting client signature
                </div>
              )
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
  SIGNED: "bg-success/10 text-success",
  VOID: "bg-ink-mute/10 text-ink-mute line-through",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${STATUS_STYLES[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

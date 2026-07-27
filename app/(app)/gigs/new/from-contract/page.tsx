import { requireUser } from "@/lib/session";
import { ContractExtractionFlow } from "@/components/ContractExtractionFlow";

// Contract-first gig creation. Patrick uploads a signed contract PDF;
// Claude Sonnet 5 extracts the venue, date, times, and client contact
// (Producer); Patrick reviews the auto-filled fields on the next page
// and clicks Save. The contract PDF itself lands in the new gig's
// bandleader-private contract slot as part of the same save.
//
// See docs/specs/contract-extraction.md for the full flow.
export default async function NewGigFromContractPage() {
  // Gate the route by auth — the client component runs the extraction
  // through a server action that also gates, so this is belt-and-
  // suspenders.
  await requireUser();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <header className="mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-mute">
          New gig
        </div>
        <h1 className="mt-1 font-serif text-[32px] font-light text-ink">
          From a contract
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-[1.55] text-ink-soft">
          Upload the signed contract and we&apos;ll pull out the venue,
          date, times, and client contact. You&apos;ll review everything
          before it saves &mdash; nothing goes into your gig list without
          your say-so.
        </p>
      </header>
      <ContractExtractionFlow />
    </div>
  );
}

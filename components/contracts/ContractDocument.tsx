import type { Contract } from "@/lib/generated/prisma/client";
import {
  boilerplateSections,
  centsToDisplay,
  romanNumeral,
  type ContractSection,
} from "@/lib/contracts/boilerplate";

type ContractDocumentProps = {
  contract: Contract;
  bandleaderName: string;
  businessName: string;
  address: string;
  email: string;
  phone: string;
  // Rendered inside the signature block on the Purchaser side — either the
  // live SignaturePad (unsigned, public portal) or a static "signed" stamp
  // (already signed, or the bandleader's own read-only preview).
  signatureSlot: React.ReactNode;
};

const INTRO =
  "This Performance Agreement is entered into as of the date of the last signature below, by and between {ARTIST} (“Artist”) and {PURCHASER} (“Purchaser”), together the “Parties,” for a live musical performance under the terms and conditions set forth herein.";

function Diamond({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`inline-block h-[7px] w-[7px] ${className}`} aria-hidden="true">
      <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" />
    </svg>
  );
}

function EventRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-6 py-[7px]">
      <div className="w-[140px] shrink-0 font-sans text-[9px] font-medium tracking-[0.18em] text-contract-soft uppercase">
        {label}
      </div>
      <div className="flex-1 font-sans text-[13px] text-contract-ink">{value}</div>
    </div>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="flex items-baseline gap-2">
        <span className="font-sans text-[12px] text-contract-gold">{romanNumeral(index)}.</span>
        <span className="font-sans text-[12px] font-medium tracking-[0.16em] text-contract-ink uppercase">
          {title}
        </span>
      </div>
      <div className="relative mt-[9px] border-t border-contract-rule">
        <div className="absolute top-0 left-0 w-9 border-t-[1.5px] border-contract-gold" />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-[10px]">
          <span className="mt-[7px] h-[2px] w-[6px] shrink-0 bg-contract-gold" />
          <span className="font-sans text-[12.5px] leading-[1.6] text-contract-ink">{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function ContractDocument({
  contract,
  bandleaderName,
  businessName,
  address,
  email,
  phone,
  signatureSlot,
}: ContractDocumentProps) {
  const custom = (contract.customSections as ContractSection[] | null) ?? [];
  const boilerplate = boilerplateSections();

  // Reading order follows Patrick's own contracts: what the engagement
  // is, what's being performed, then THE MONEY, then the legal
  // boilerplate nobody reads twice. Compensation buried behind four
  // indemnity clauses is how clients miss the deposit terms.
  // Section I is Event Details (rendered separately below), so the
  // numbered run starts at 2.
  // romanNumeral() is 0-indexed into the numeral list, and Event Details
  // already occupies index 0 ("I."), so the custom run is 1..custom.length
  // and Compensation lands immediately after it.
  const compensationIndex = 1 + custom.length;
  const boilerplateStart = compensationIndex + 1;

  const intro = INTRO.replace("{ARTIST}", bandleaderName).replace(
    "{PURCHASER}",
    contract.purchaserName,
  );

  return (
    <div className="bg-contract-paper px-6 py-10 sm:px-10 sm:py-14 md:px-16">
      <div className="mx-auto max-w-[640px]">
        {/* Masthead */}
        <div className="border-t border-contract-gold pt-5 text-center">
          <h1 className="font-sans text-[26px] leading-none font-light text-contract-ink">
            {bandleaderName.toLowerCase()}
          </h1>
          <div className="mt-2 font-sans text-[9px] tracking-[0.3em] text-contract-soft uppercase">
            {businessName}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-contract-gold">
            <span className="h-px w-16 bg-current" />
            <Diamond />
            <span className="h-px w-16 bg-current" />
          </div>
          <div className="mt-3 font-sans text-[9px] tracking-[0.2em] text-contract-soft uppercase">
            {address}
          </div>
          <div className="mt-8 font-sans text-[10px] tracking-[0.28em] text-contract-gold uppercase">
            An engagement of
          </div>
          <h2 className="font-contract-serif mt-2 text-[30px] text-contract-ink">
            Performance Agreement
          </h2>
          <div className="mt-3 flex items-center justify-center gap-3 text-contract-gold">
            <span className="h-px w-5 bg-current" />
            <Diamond />
            <span className="h-px w-5 bg-current" />
          </div>
          <div className="mt-3 font-sans text-[10px] tracking-[0.2em] text-contract-soft uppercase">
            Contract N&deg; {contract.contractNumber}
          </div>
          <p className="font-contract-serif mt-6 text-[14px] text-contract-soft italic">
            {intro}
          </p>
        </div>

        {/* Event details */}
        <div className="mt-9">
          <div className="flex items-baseline gap-2">
            <span className="font-sans text-[12px] text-contract-gold">I.</span>
            <span className="font-sans text-[12px] font-medium tracking-[0.16em] text-contract-ink uppercase">
              Event Details
            </span>
          </div>
          <div className="relative mt-[9px] border-t border-contract-rule">
            <div className="absolute top-0 left-0 w-9 border-t-[1.5px] border-contract-gold" />
          </div>
          <div className="mt-4 divide-y divide-contract-rule">
            <EventRow label="Event" value={contract.eventName} />
            <EventRow
              label="Venue"
              value={[contract.venueName, contract.venueAddress].filter(Boolean).join(" · ")}
            />
            <EventRow label="Date" value={contract.eventDateLong} />
            <EventRow label="Performance" value={contract.performanceWindow} />
            <EventRow label="Program" value={contract.program} />
            <EventRow
              label="Purchaser Contact"
              value={[contract.purchaserName, contract.purchaserEmail, contract.purchaserPhone]
                .filter(Boolean)
                .join(" · ")}
            />
            <EventRow
              label="Artist Contact"
              value={[bandleaderName, email, phone, address].filter(Boolean).join(" · ")}
            />
          </div>
        </div>

        {/* Per-gig sections — performance requirements, travel, whatever
            this particular engagement needs */}
        {custom.map((s, i) => (
          <Section key={s.title} index={i + 1} title={s.title}>
            <Bullets items={s.body} />
          </Section>
        ))}

        {/* Compensation */}
        <Section index={compensationIndex} title="Compensation">
          {/* Label column / figure column, both left-aligned — the
              figures line up in a single rail the way they do on the
              printed agreement, instead of drifting to the right edge. */}
          <div className="divide-y divide-contract-rule">
            <div className="flex items-baseline gap-6 py-[10px]">
              <span className="w-[140px] shrink-0 font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
                Total Fee
              </span>
              <span className="font-contract-serif text-[19px] text-contract-ink tabular-nums">
                {centsToDisplay(contract.feeCents)}
              </span>
            </div>
            <div className="flex items-baseline gap-6 py-[10px]">
              <span className="w-[140px] shrink-0 font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
                Deposit
              </span>
              <span className="font-sans text-[13px] text-contract-ink tabular-nums">
                {centsToDisplay(contract.depositCents)}
              </span>
              <span className="font-sans text-[11.5px] text-contract-mute">
                non-refundable, due upon execution to confirm the date
              </span>
            </div>
            <div className="flex items-baseline gap-6 py-[10px]">
              <span className="w-[140px] shrink-0 font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
                Balance
              </span>
              <span className="font-sans text-[13px] text-contract-ink tabular-nums">
                {centsToDisplay(contract.balanceCents)}
              </span>
              <span className="font-sans text-[11.5px] text-contract-mute">
                due immediately following the performance
              </span>
            </div>
          </div>
        </Section>

        {/* Standard legal terms, same on every GigWright contract */}
        {boilerplate.map((s, i) => (
          <Section key={s.title} index={boilerplateStart + i} title={s.title}>
            <Bullets items={s.body} />
          </Section>
        ))}

        {/* Signatures */}
        <Section index={boilerplateStart + boilerplate.length} title="Signatures">
          <p className="mb-6 font-sans text-[12.5px] leading-[1.6] text-contract-ink">
            By signing below, the Parties acknowledge and agree to the terms set forth herein.
            Electronic signatures shall be deemed valid and enforceable.
          </p>
          <div className="flex items-center justify-center gap-3 text-contract-gold">
            <span className="h-px w-10 bg-current" />
            <span className="font-sans text-[10px] tracking-[0.28em] uppercase">Accepted and agreed</span>
            <span className="h-px w-10 bg-current" />
          </div>
          <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2">
            <div>
              <div className="font-sans text-[9.5px] tracking-[0.2em] text-contract-gold uppercase">
                The Purchaser
              </div>
              <div className="font-contract-serif mt-2 text-[17px] text-contract-ink">
                {contract.purchaserName}
              </div>
              <div className="mt-1 space-y-0.5 font-contract-serif text-[12px] text-contract-soft italic">
                {contract.purchaserEmail && <div>{contract.purchaserEmail}</div>}
                {contract.purchaserPhone && <div>{contract.purchaserPhone}</div>}
              </div>
              <div className="mt-8">{signatureSlot}</div>
            </div>
            <div>
              <div className="font-sans text-[9.5px] tracking-[0.2em] text-contract-gold uppercase">
                The Artist
              </div>
              <div className="font-contract-serif mt-2 text-[17px] text-contract-ink">
                {bandleaderName}
              </div>
              <div className="mt-1 space-y-0.5 font-contract-serif text-[12px] text-contract-soft italic">
                <div>{businessName}</div>
                <div>{email}</div>
                <div>{phone}</div>
              </div>
            </div>
          </div>
        </Section>

        <div className="mt-10 flex items-center justify-between border-t border-contract-rule pt-3 font-sans text-[9px] tracking-[0.15em] text-contract-mute uppercase">
          <span>N&deg; {contract.contractNumber}</span>
          <span>{businessName}</span>
        </div>
      </div>
    </div>
  );
}

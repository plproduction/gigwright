// Fixed legal boilerplate shared by every GigWright performance agreement.
// Mirrors the SECTIONS structure in Patrick's own make_brennan_contract.py
// (the "Niblick white-stock" template) — kept in one place so a wording
// fix applies to every bandleader's contracts at once, the same reason
// the Python version kept these out of per-gig data.
//
// Per-gig sections (performance requirements, travel, cancellation detail
// that varies by engagement) live on Contract.customSections instead,
// since those genuinely differ gig to gig.

export type ContractSection = {
  title: string;
  body: string[];
};

export function boilerplateSections(): ContractSection[] {
  return [
    {
      // Patrick, 2026-11-22: "I may just say six piece. I don't want to
      // put every specific thing on there because it's more legally
      // binding for me, the contractor. I'd like the ability to swap out
      // players, inevitably, if there's an issue."
      //
      // He was already safe on the first half — a GigWright contract has
      // never listed personnel; the band is one free-text line. The half
      // that was missing is this clause. Naming nobody doesn't give you
      // the right to substitute; saying so does. It sits first because
      // it's the clause that governs what the band actually is.
      //
      // Standard engagement-contract language, not legal advice — worth
      // having his own attorney read once.
      title: "PERSONNEL & SUBSTITUTION",
      body: [
        "Artist shall furnish musicians in the instrumentation described above. Artist retains sole discretion over the selection of individual musicians and reserves the right to substitute any musician with another of comparable professional calibre, at any time and without prior notice to or consent of Purchaser. No such substitution shall constitute a breach of this Agreement or entitle Purchaser to any reduction in the fee.",
        "Any individual musician named in this Agreement or in any related correspondence is identified for reference only and is not a condition of performance, unless this Agreement expressly provides otherwise in a writing signed by both Parties.",
      ],
    },
    {
      title: "LIABILITY & INDEMNITY",
      body: [
        "Purchaser shall be responsible for compliance with any requirements of the venue, including any certificate of insurance the venue may require; Purchaser shall notify Artist in writing of any such venue requirement no later than fourteen (14) days prior to the performance date.",
        "Purchaser shall indemnify and hold Artist harmless from and against any and all claims, losses, damages and related expenses arising out of or relating to any act or omission of Purchaser, its guests or agents in connection with the engagement, including damage to Artist's instruments or equipment caused by guests.",
      ],
    },
    {
      title: "INDEPENDENT CONTRACTOR",
      body: [
        "Artist represents and warrants that Artist is an independent contractor, is self-employed, and has agreed for purposes of this engagement to be classified as an independent contractor. Artist is solely responsible for all taxes, withholdings, and filings arising from the compensation paid hereunder.",
      ],
    },
    {
      title: "JURISDICTION & SEVERABILITY",
      body: [
        "This Agreement shall be governed by, construed under, and enforced in accordance with the laws of the state in which Artist resides. In the event suit or action is instituted to enforce any provision of this Agreement, the prevailing Party shall be entitled to recover such sum as the court may adjudge reasonable as attorneys' fees in such suit or action and any appeal therefrom, together with all related collection fees.",
        "Any term or provision of this Agreement that is invalid or unenforceable shall be ineffective only to the extent of such invalidity or unenforceability, without rendering the remaining terms and provisions invalid or unenforceable, and the remainder of this Agreement shall remain in full force and effect.",
      ],
    },
    {
      title: "ENTIRE AGREEMENT",
      body: [
        "This Agreement and any document furnished pursuant to the provisions hereof embody the entire agreement and understanding of the Parties as to the subject matter contained herein. There are no restrictions, promises, representations, warranties, covenants or understandings other than those expressly set forth or referred to in such documents, and this Agreement supersedes all prior negotiations and agreements, whether oral or written. No amendment or modification shall be valid unless in writing and signed by both Parties.",
      ],
    },
  ];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function romanNumeral(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

export function centsToDisplay(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

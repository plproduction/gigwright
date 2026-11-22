# Client contracts, e-signature & invoicing — build notes

**Status:** Built (first pass), 2026-11-21. Schema migration NOT yet applied
to the live database — see "Before deploying" below.
**Owner:** Patrick (bandleader founder).

---

## Why

Competitive review against Back On Stage (the category incumbent: 10,000+
musicians, $25M+ booked) found three features it sells at its *cheapest*
$19/mo tier that GigWright had nothing for:

1. Client contracts with e-signature
2. Client-facing invoicing and online payment
3. Lead capture with automated follow-up

Items 1 and 2 are this spec. Until they shipped, a bandleader on GigWright
still needed a second tool just to get paid by the client — which hollowed
out the "one gig record" pitch at its most expensive point.

Note this is the *opposite direction* from the already-built
contract-extraction flow (`docs/specs/contract-extraction.md`), which reads
a contract a VENUE sent us. This generates the agreement WE send the client.
Both can coexist on one gig: `Gig.contractUrl` is the venue's paperwork
(bandleader-private), `Gig.contract` is ours (client-facing).

## How Back On Stage does it (observed, Nov 2026)

From their own help center, not marketing copy:

- A booking is created minimally (title / status / date / client), then
  services are attached, and the invoice pulls its line items from those
  services.
- **The contract is generated FROM the invoice** — their words: "leverages
  invoice details to automate contract creation." Not two separate flows.
- Both documents live in one "Documents" panel on the booking and go out
  through a **single Client Portal link**, where the client views, e-signs,
  and pays. Not separate contract/invoice links.
- Payment collection is per-bandleader PayPal.

We match the single-link model (one `Gig.clientPortalToken` serving both
documents) because it's demonstrably what clients cope with best — one
URL, everything in it. We deliberately do NOT chain contract generation off
the invoice: a bandleader frequently wants the agreement signed before any
invoice exists.

## Design

The document itself is Patrick's own letterhead performance agreement,
translated to the web from `make_brennan_contract.py` in the Contract Maker
Template project (the "Niblick white-stock" rebuild):

- **White stock** (`--color-contract-paper: #FFFFFF`), explicitly NOT the
  app shell's warm cream — Patrick's direction: "use the white background
  on the contract pages."
- Inter for body/labels, **Cormorant Garamond** for display type, gold
  `#B8945E` rules and eyebrows, ink `#2B2B2B`.
- Centered masthead, gold diamond dividers, roman-numeral sections each
  under a full rule with a short gold accent segment, letterspaced small
  caps for labels.
- Reading order: Event Details → per-gig sections → **Compensation** →
  legal boilerplate → Signatures. Money sits with the performance terms,
  not buried behind four indemnity clauses.

Tokens live in `app/globals.css` under the `--color-contract-*` /
`--font-contract-serif` prefix, kept separate from the app-shell palette so
the two visual registers never bleed into each other.

## What's built

| Piece | Where |
|---|---|
| `Contract`, `Invoice`, `InvoiceLineItem` models, `ContractStatus`/`InvoiceStatus` enums | `prisma/schema.prisma` |
| `Gig.clientPortalToken`, `User.businessName/businessAddress/businessPhone/paypalEmail` | `prisma/schema.prisma` |
| Migration | `prisma/migrations/20261121_contracts_and_invoicing/` |
| Contract generate / send / sign | `lib/actions/contracts.ts` |
| Invoice generate / send / record payment | `lib/actions/invoices.ts` |
| Shared legal boilerplate + numeral/money helpers | `lib/contracts/boilerplate.ts` |
| Contract letterhead render | `components/contracts/ContractDocument.tsx` |
| Invoice render | `components/contracts/InvoiceDocument.tsx` |
| Canvas e-signature capture | `components/contracts/SignaturePad.tsx`, `SignForm.tsx` |
| Bandleader-side panel on the gig page | `components/contracts/GigContractInvoicePanel.tsx` |
| Public client portal | `app/c/[token]/page.tsx` |
| Dev-only design preview | `app/c/preview/page.tsx` (404s in production) |

Terms are **snapshotted** onto `Contract` at generation time rather than
read live off Gig/Venue/Producer. A signed agreement must never silently
change because the bandleader later edited the gig. Regeneration is blocked
once status leaves DRAFT.

E-signature is captured in-app — typed name + drawn canvas signature, with
`signerIp` and `signedAt` recorded — rather than round-tripping through
DocuSign the way Patrick's PDF contracts currently do (those embed
`\s1\` / `\d1\` anchor tags for DocuSign's field placement).

`/c/*` is on the public allowlist in `proxy.ts`. It has to be: clients have
no GigWright account and never will, so the unguessable token is the
authorization — same trust model as `/cal/` feeds and `/g/` RSVP links.

## Before deploying

1. **Apply the migration.** It was hand-authored on a machine with no
   `DATABASE_URL`, then verified against Prisma's own generator:

   ```
   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
   ```

   All three `CREATE TABLE` blocks came back byte-identical, and the
   enums, indexes and foreign keys match. So the SQL itself is correct
   for this schema. What's still unverified is whether it applies
   cleanly to the *live* database — that depends on production matching
   the repo's schema. Confirm with a `migrate diff` against Neon before
   `migrate deploy`.
2. **Backfill nothing** — all new columns are nullable or defaulted, and
   the three new tables start empty.

## Not built yet

- **PayPal capture.** `Invoice.paypalOrderId` and `User.paypalEmail` are in
  the schema and the portal reserves the slot, but the Buttons SDK isn't
  wired — needs a real PayPal client ID. `recordInvoicePayment()` covers
  the manual case (check / Zelle / cash), which bandleaders need anyway.
- **Signed PDF snapshot.** `Contract.pdfUrl` is reserved. Plan:
  `@react-pdf/renderer` (pure JS, survives serverless) mirroring the same
  layout, generated on signature and stored in Vercel Blob.
- **Emailing the invoice.** `sendContract()` emails the portal link via
  Resend; `sendInvoice()` only flips status so far.
- **Lead capture + auto follow-up** — the third gap from the competitive
  review, still open.

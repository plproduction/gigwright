# Contract-to-Gig extraction — product spec

**Status:** Spec, awaiting Patrick's go/no-go.
**Owner:** Patrick (bandleader founder).
**Drafted:** 2026-07-27.

---

## The opportunity

Booking a gig today follows a predictable arc: the venue emails a
contract → Patrick reviews it → Patrick opens GigWright → Patrick types
the venue, address, date, load-in, downbeat, end time, pay, deposit,
and client contact into a form → Patrick uploads the same PDF he was
just reading. Every number he types is *already in the PDF*. He's the
carrier pigeon between the contract and the database.

For a working bandleader booking 40–150 gigs a year, that data-entry
tax is real. Ten minutes per gig × 100 gigs = 16 hours a year of pure
transcription. And the failure mode is not "took a long time" — it's
"typo on the load-in time, band shows up late." Human transcription
introduces the exact class of error that costs the most on gig night.

**Contract extraction** flips it: upload the PDF, machine reads every
field, Patrick reviews and clicks Save. The PDF is stored in the same
private contract slot that already exists ([contract upload](../../components/ContractUpload.tsx),
shipped 2026-07-27). One drag-drop replaces the entire form.

No competitor does this. Ask GigLogix or Muzeek to "make a gig from
this contract" and they'll blink at you.

---

## The user story

**Today (7 steps, 8–15 minutes):**

1. Venue emails signed contract.
2. Patrick opens GigWright, clicks "New gig."
3. Patrick opens the PDF in another tab, reads it.
4. Patrick types venue name → GigWright shows dropdown of existing
   venues → picks match, or types full address if new.
5. Patrick types date, load-in, downbeat, end time, pay, deposit.
6. Patrick types client contact name, email, phone.
7. Patrick uploads the PDF to the contract slot.

**With extraction (3 steps, ~90 seconds):**

1. Venue emails signed contract.
2. Patrick opens GigWright, clicks "New gig from contract," drags PDF.
3. Review page shows every extracted field. Patrick eyeballs it,
   tweaks anything off, clicks Save. PDF is already in the contract
   slot.

Round-trip goes from 10 minutes to 90 seconds. Transcription errors
go to zero (Patrick still reviews, but he's not typing).

---

## Scope of what's extracted

**Confirmed by Patrick 2026-07-27 — narrow scope:**

| Field                | Source in contract                       |
|----------------------|------------------------------------------|
| Venue name           | Letterhead, "at [venue]", event location |
| Venue address        | Event address block (street/city/state/zip) |
| Event date           | "Date of engagement" or similar          |
| Load-in time         | Explicit, else null (Patrick fills)      |
| Downbeat time        | "Performance begins" / "Music from"      |
| End time             | "Music ends" / "Performance ends"        |
| Client contact name  | Signatory / "purchaser" / "on behalf of" |
| Client contact email | Under signatory block                    |
| Client contact phone | Under signatory block                    |
| Client company       | Signatory's company / organization       |

**Client contact becomes a Producer** — the extracted person is
added to a new **Producer** entity (Patrick's rolodex of people who
book him), and this gig is linked to that producer. If the extracted
producer already exists (matched by email or by name+phone), reuse
the existing row. Producers live at `/producers` (new page, parallels
`/venues` and `/roster`).

**Explicitly NOT extracted:**

- **Pay / deposit** — Patrick reads the contract himself for money
  details. Confirmed 2026-07-27.
- Personnel / lineup — contracts don't list the sidemen
- Set list — never in contracts
- Dress code, guest count, meal, parking — nice-to-have but skipped
  in v1 to keep the prompt tight and accuracy high

---

## Venue matching (the tricky part)

Every gig anchors to a `Venue` row. The extractor MUST NOT create
duplicate venues — "The Sunset Casino" and "Sunset Casino" and "Sunset
Casino Ballroom" all need to collapse to the one venue Patrick has
already booked ten times.

**Matching algorithm (server-side, after Claude returns JSON):**

1. **Normalize** the extracted venue name:
   - Lowercase
   - Strip leading "The "
   - Strip trailing " Ballroom / Hotel / Casino / Resort / Room"
   - Collapse whitespace and punctuation
2. **Exact match** against normalized existing venue names owned by
   this bandleader → use it.
3. **Address match** — if the extracted street address matches an
   existing venue's street address (post-normalization), use that
   venue regardless of name mismatch.
4. **Fuzzy fallback** — Levenshtein distance ≤ 2 on the normalized
   name → show as "Did you mean [existing venue]?" with two buttons:
   *Use existing* / *Create new*.
5. **No match** — pre-populate a new venue with the parsed name +
   address, but do not commit until Patrick clicks Save on the review
   page.

**Address parsing:** delegate to Claude. It's better at "1234 Main St
Suite 400, Portland, OR 97201" than any regex. Return street /
city / state / zip as separate fields.

---

## The extraction pipeline

```
┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│ PDF upload   │ ──▶ │ Claude API  │ ──▶ │ Review page      │
│ (Vercel Blob)│     │ (vision)    │     │ (all fields      │
└──────────────┘     └─────────────┘     │  editable)       │
                                          └────────┬─────────┘
                                                   │ Save
                                                   ▼
                                          ┌──────────────────┐
                                          │ Venue match      │
                                          │  → Gig.create()  │
                                          │  → Contract slot │
                                          └──────────────────┘
```

**File handling:** the same upload flow the existing contract slot
uses (Vercel Blob direct-upload, `/api/upload/contract`). The PDF is
kept regardless of extraction outcome.

**Claude call:**
- Model: **Sonnet 5** (`claude-sonnet-5`). Sweet spot for structured
  PDF extraction. Fast, accurate, cheap.
- Input: PDF as base64 via the Anthropic API's document content block.
  (Claude reads PDFs natively — no OCR step, no PDF-to-image conversion
  needed.)
- Output: JSON matching a Zod schema (below). Enforced by structured
  output / tool use.
- Timeout: 60s hard, with a friendly "Still reading — usually done in
  10 seconds" spinner past the 8s mark.

**Cost model (estimated):**
- Sonnet 5: ~$3 / million input tokens, ~$15 / million output.
- Typical 2-page contract: ~4K input tokens (mostly the PDF binary
  encoding), ~500 output tokens.
- Per-extraction cost: **~$0.02**.
- At Patrick's volume (say 100 gigs/year): **$2/year**. At scale
  (1,000 bandleaders × 100 gigs/year): **$2K/year in Anthropic
  charges**. Trivial vs. the value.

---

## Schema

```ts
// lib/extract-contract.ts
const ExtractedContractSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  venue: z.object({
    name: z.string(),
    street: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
  }),
  event: z.object({
    date: z.string().nullable(),        // ISO 8601, no timezone
    loadInTime: z.string().nullable(),  // "HH:MM"
    downbeatTime: z.string().nullable(),
    endTime: z.string().nullable(),
  }),
  producer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    company: z.string().nullable(),
  }),
  unrecognizedFields: z.array(z.string()),
});
```

**Confidence rules Claude will follow (in the extraction prompt):**
- `high` — every Priority A field cleanly extracted, no ambiguity.
- `medium` — one Priority A field is missing or ambiguous (e.g.,
  "TBD" for end time), OR the contract is a scan/photo (not a native
  PDF).
- `low` — two+ Priority A fields missing, OR the document doesn't
  look like a contract at all.

The review page renders these differently: `high` shows fields
clean; `medium` highlights the ambiguous field in gold; `low` shows a
"This doesn't look like a contract we can auto-extract from" banner
above the review form with all fields blank and the PDF preview
alongside.

---

## The review page

**Route:** `/gigs/new/from-contract`

**Layout (Ritz-Carlton, matches existing gig detail):**

- **Left column:** PDF preview (embedded `<iframe>` or `<embed>`).
  Patrick can scroll while reviewing extracted fields.
- **Right column:** every extracted field as an editable input, in
  the same visual language as the existing New Gig form. Fields
  flagged `medium` confidence carry a small gold dot; blank fields
  from `low` confidence extraction sit ready for typing.
- **Venue block:** if match found → "Use existing: **Sunset Casino**"
  with a "Different venue" link. If fuzzy match → both options
  side-by-side. If no match → new-venue fields prefilled.
- **Bottom:** "Save gig" (primary) / "Discard, upload different
  contract" (secondary).

**Post-save:** redirect to `/gigs/[id]` (the standard gig detail
page). The uploaded PDF is already in that gig's contract slot — no
re-upload step.

---

## The prompt

Claude gets a short system prompt (~200 tokens) plus the PDF. The
core:

```
You are extracting structured booking information from a music
performance contract for a bandleader's booking-management app. Read
the attached PDF (or photo of a contract) and return the fields
defined in the JSON schema.

Rules:
- Money fields are in cents (integer). "$3,500" → 350000.
- Times are 24-hour HH:MM in the venue's local time (do NOT convert
  to UTC — this is a wall-clock time).
- Dates are ISO 8601 (YYYY-MM-DD), no timezone.
- If a field is not stated in the contract, return null. Do not
  guess.
- Load-in time is often not stated; if the contract only says
  performance times, return null for loadInTime (do NOT compute a
  fake one — the app will compute a default downstream).
- The venue name is the PERFORMANCE location, not the client's
  business or the booking agent. "Smith Corp Holiday Party at The
  Sunset Casino" → venue = "The Sunset Casino".
- Return your confidence: high, medium, or low. Err toward medium if
  unsure; only mark high when every Priority A field is unambiguous.
- List anything you saw in the contract that doesn't fit the schema
  in unrecognizedFields (e.g., "cancellation policy: 30-day",
  "sound check required 5pm"). Patrick may want it in Notes.
```

---

## Environment / dependencies

- **`ANTHROPIC_API_KEY`** in Netlify env. Separate billing from
  Patrick's claude.ai subscription. Get key from console.anthropic.com.
- **`@anthropic-ai/sdk`** as a runtime dependency (already have
  Prisma, adding one more Node module).
- No new database columns needed — extracted data flows into the
  existing `Gig` and `Venue` tables via the normal create path. The
  PDF lands in the existing `contractUrl` / `contractFileName`
  columns just added.

---

## Failure modes and how we handle each

| Failure                     | User sees                                            | Recovery                                             |
|-----------------------------|------------------------------------------------------|------------------------------------------------------|
| Anthropic API timeout       | "Extraction is taking longer than usual — retry?"    | Retry button; underlying PDF is already uploaded     |
| Anthropic API 5xx           | Toast: "Extractor is having a rough day"             | Fall back to blank New Gig form with PDF prefilled   |
| Anthropic rate limit        | Same as 5xx                                          | Same                                                 |
| Claude returns unparseable  | "We couldn't read this one — fill it in yourself"    | Manual form, PDF prefilled to contract slot          |
| Wrong file type uploaded    | Client-side block (existing contract upload logic)   | N/A                                                  |
| Bad extraction (Patrick's judgment) | Fields visibly wrong on review page          | Patrick edits them before saving — the whole point   |
| Venue duplicate created anyway | Merge tool in a later spec                         | Not v1 scope; low frequency if normalization is solid|

---

## What v1 does NOT include

- **Backfilling existing gigs.** For now, extraction only creates new
  gigs. A "re-extract from contract" button on the existing contract
  slot is a v2 add.
- **Personnel / lineup detection.** Contracts don't specify sidemen;
  Patrick assigns them post-extraction as he does today.
- **Multi-gig contracts** (e.g., a residency contract for four dates).
  If Claude flags it, we surface an error and Patrick creates each
  gig individually. v2 could handle this if it comes up often.
- **Auto-send-to-band on extract.** Extraction creates a gig in the
  same state as manual entry — Patrick reviews personnel, then hits
  "Send updates" as normal.
- **Contract redlining / suggestions.** Not our job.

---

## Milestones

**M1 — extraction pipeline (backend only):**
- Add `ANTHROPIC_API_KEY` to Netlify env.
- New `lib/extract-contract.ts` with the Claude call + Zod schema.
- Server action `extractContractFromBlob(blobUrl): Promise<Extracted>`.
- No UI yet — verify from Prisma Studio or a scratch route.
- Test on 5–10 real Patrick contracts.

**M2 — review page:**
- Route `/gigs/new/from-contract`.
- Upload flow (reuse existing contract upload API endpoint).
- Review form with all fields editable.
- Venue matcher (exact + normalized + fuzzy) with UI.
- Save creates Gig + Venue as needed.

**M3 — entry points:**
- "New gig from contract" button on `/my-gigs` and the dashboard.
- Optional: on the existing gig contract slot, an "Extract details"
  button that runs the pipeline and offers to backfill blank fields
  (v1.5).

**M4 — telemetry (light):**
- Log every extraction with: contract file size, extraction latency,
  Claude confidence score, how many fields Patrick edited on the
  review page.
- Purpose: figure out which fields Claude gets wrong most often, so
  the prompt can be tuned.

---

## Success metric

**Adoption:** within 30 days of shipping, > 50% of new gigs Patrick
creates come through the extraction flow (vs. manual New Gig).

**Accuracy:** median number of fields edited on the review page < 2.
If it's higher, the prompt needs work. If it's zero, we could
consider skipping the review page for `high` confidence extractions.

**Time-to-gig:** median time from clicking "New gig from contract"
to landing on `/gigs/[id]` < 3 minutes (extraction + review).

---

## Open questions for Patrick

1. **Extraction on top of the existing contract slot?** i.e., after
   uploading a contract to an already-created gig, offer to "extract
   details and fill in what's blank." Nice-to-have or must-have for
   v1?
2. **Multi-gig contracts** — how often does a single contract cover
   more than one date? If common, promote from v2 to v1.
3. **`ANTHROPIC_API_KEY`** — happy to spend $2–5/month on this in
   year one?
4. **Personnel from prior gigs at same venue?** Not extracted from
   the contract, but we *could* auto-propose the last lineup Patrick
   used at that venue. Feels adjacent — worth mentioning here since
   the trigger is the same.

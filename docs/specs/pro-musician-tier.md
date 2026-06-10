# Pro Musician tier — product spec

**Status:** Spec, awaiting Patrick's go/no-go.
**Owner:** Patrick (bandleader founder).
**Drafted:** 2026-06-02.

---

## The opportunity

Today GigWright is sold to bandleaders. Sidemen log in as a convenience —
to set their payment method, see their gig list, and receive automated
SMS / email. They never pay anything; the bandleader pays for them.

Most working sidemen play with 3–10 different bandleaders in a given year.
At year-end, they assemble their own tax records — usually a messy
combination of spreadsheets, calendar history, bandleader-emailed pay
stubs, and a Notes app full of half-remembered mileage. They have no
single source of truth for their own contractor work.

**Pro Musician** is a paid tier *for the sideman*, not the bandleader.
It turns the musician portal into the sideman's personal contractor
operating system — every gig they played, who paid them, what they
deducted, all in one place. Aggregated across every GigWright-using
bandleader who has ever booked them.

Competitors do not do this. The closest analog is generic 1099 tools
like Stride or MileIQ — but those don't know what a gig is, don't know
who paid you, and don't aggregate cross-employer data automatically.
GigWright is the only platform where the data is already there.

---

## Free tier (musician) — what's already shipped

- See every gig you're on, across every bandleader who uses GigWright
- Set your payment method + payout address (once, used by every bandleader)
- Receive automated SMS / email for gig updates
- Per-gig mileage logging (shipped 2026-06-02)
- Year-end tax summary page with CSV download for mileage (shipped 2026-06-02)
- Notification preferences per channel

## Pro tier — what gets unlocked

### 1. Full Schedule C expense tracking, not just mileage

Currently a sideman can log mileage per gig. Pro extends this to the
same tax-aware expense buckets the bandleader already uses:

- **Per diem** — federal rate per day on the gig
- **Meals** — 50% deductible, auto-calculated
- **Lodging** — actual cost
- **Travel** — flights, tolls, parking, ride share
- **Gear hauling** — extra mileage with a trailer
- **General** — open-ended bucket

Each expense category gets its own column in the year-end CSV plus its
own Schedule C-aligned dollar total.

**Why it's worth paying for:** A working sideman tracks at minimum
$5K–$15K of legitimate deductions per year. Forgetting or under-logging
those deductions costs them real cash at filing time. Pro pays for
itself the first April it's used.

### 2. Income reconciliation across bandleaders

The system already knows what every bandleader has paid this musician
(via `GigPersonnel.payCents` + `paidAt`). Pro surfaces a per-musician
income view: total paid YTD, broken down per bandleader, with each
expected 1099-NEC threshold flagged at $600.

**Why it's worth paying for:** End-of-year 1099 reconciliation. Pro shows
"Patrick Lamb Productions paid you $3,200 this year — you should get a
1099 for at least this amount." If the 1099 they receive in January
doesn't match, the musician knows immediately and can ask for a
correction. Today this requires manually adding up calendar entries.

### 3. PDF tax pack for the CPA

A single PDF the musician can hand their accountant on April 1st:

- Page 1: Schedule C totals (income by payer, deductions by bucket)
- Page 2: Mileage detail with venue addresses
- Page 3: Per-diem detail with date / city
- Page 4: Misc deductions
- Page 5: Any client-issued 1099 amounts the musician has loaded in

**Why it's worth paying for:** Most CPAs charge $50–$150 just to
organize a sideman's source data. The PDF tax pack is "I already
organized it — here, copy these numbers into TurboTax / your software."
Saves the CPA bill OR makes the musician's own filing actually feasible.

### 4. Multi-bandleader pay tracking even for non-GigWright gigs

A "side ledger" the musician can fill in for gigs they played that
weren't booked through GigWright (the bar gig, the wedding for a
non-GigWright leader, etc.). Same data shape as a GigWright gig, but
manually entered.

**Why it's worth paying for:** GigWright's slice of any individual
sideman's year is partial — they play 12 gigs in GigWright and 40 gigs
outside it. Pro gives them ONE place to track all 52, not just the 12
that happened to flow through their bandleaders.

### 5. Quarterly estimated-tax reminder

Email + SMS reminder before each quarterly estimated-tax deadline
(Apr 15, Jun 15, Sep 15, Jan 15), with the musician's running YTD
income and a rough estimated quarterly payment based on it.

**Why it's worth paying for:** Sidemen routinely under-pay quarterly
estimates and get hit with underpayment penalties. A nudge with a
specific dollar amount turns this from "I should look into this" into
"pay this amount today."

### 6. iCal / calendar feed of all gigs

A personal `.ics` subscription URL the musician can hand to Apple
Calendar / Google Calendar / Outlook. Their full gig list across every
bandleader, with venue address, call time, downbeat, pay, and notes.

(Already noted as a Tier-1 low-hanging-fruit in the competitive
brief — could ship for free and use as a free-tier hook, OR
gate behind Pro depending on the funnel math.)

---

## Pricing

**$8/month** or **$60/year** (37% annual discount).

### Why this price

- Below the working musician's mental "small subscription" threshold
  ($10/mo); more painful to *think about cancelling* than to keep.
- Pays for itself with a single forgotten $300 mileage deduction at tax
  time (which at a 24% bracket saves $72 — first year is positive ROI
  basically guaranteed).
- 1/6 of the bandleader Pro tier ($49/mo). Sideman pricing is
  intentionally cheaper because their willingness-to-pay is lower —
  but their LTV is high because they keep paying year after year.

### Trial / hook

**14-day free trial, no card required.** End of trial → soft paywall
on tax-summary CSV download + PDF tax pack only. They can keep using
the musician portal for free; they just can't get the year-end data
out without upgrading. Aligns the moment-of-pain (tax time) with the
moment-of-payment (upgrade prompt).

### Bandleader-as-gift option

A bandleader can "comp" Pro Musician for any sideman on their roster
for $5/mo (paid out of the bandleader's billing). This is a retention
move for the bandleader — *"I take care of my band's tax tools for
them"* — and a viral expansion lever for GigWright.

---

## What stays free for the sideman

- Login + gig list across every bandleader
- Set payment method + payout address
- Per-gig mileage logging (the basic case)
- Year-end mileage CSV (basic, no PDF, no other expense buckets)
- SMS / email gig updates

The free tier is genuinely useful so the sideman has reason to log in
regularly — which is what builds the dataset Pro is selling against.

---

## Implementation phases

### Phase 1 (1 week) — internal foundation
- Add `User.musicianPlan` enum (`FREE` / `PRO`) — separate from
  `User.plan` which is the bandleader plan
- Stripe integration: musician Pro product + price + checkout flow
- Trial logic + paywall middleware on Pro-gated routes
- Per-bandleader gift-Pro flow (the bandleader pays for their sideman)

### Phase 2 (1 week) — the Pro experience
- Extend `MusicianGigMileage` to `MusicianGigExpense` (kind, amount,
  notes — mirrors `GigExpense` shape) — keeps schema uniform
- Per-gig expense UI on `/my-gigs/[id]` for each ExpenseKind
- Tax summary page upgraded with all expense buckets
- Pay-by-bandleader breakdown on the tax page

### Phase 3 (1 week) — polish + viral hooks
- PDF tax pack generator (~React-PDF or similar)
- Side ledger for non-GigWright gigs (separate `OffPlatformGig` model)
- Quarterly tax reminder cron + email/SMS templates
- iCal feed (could ship to free tier as a hook, see above)

**Total to ship Pro Musician end-to-end: ~3 weeks** for a single
engineer working full time, or ~6 weeks for a bandleader-engineer doing
this alongside the existing bandleader product.

---

## Open questions

1. **Is the iCal feed free or Pro?** Lean free — the funnel value of
   "my whole gig schedule lives in my native calendar app" is huge,
   and competitors already give this away.
2. **Is the side ledger free or Pro?** Lean Pro — it's a deliberate
   "now you can track everything, not just GigWright gigs" upsell,
   and free-tier sidemen can still use the free mileage CSV for
   their GigWright gigs.
3. **Does the bandleader see if their sidemen are on Pro?** Probably
   no — would be weird for the bandleader to know the sideman's
   personal subscription status. The gift-Pro flow is the only
   surface where the bandleader sees Pro status of their roster.
4. **Tax pack for one year only, or multi-year?** Year-one ship: one
   year per export. Year-two upgrade: multi-year audit packet.
5. **Do we offer 1099-NEC issuance for bandleaders as a Pro Bandleader
   feature?** Separate spec — would integrate naturally with this
   because the data is already there.

---

## Recommended next move

Ship Phase 1 first **without** any Pro-gated features visible yet —
just the plumbing. Then run a 4-week beta with a small handful of
sidemen Patrick personally knows. Use what they actually find painful
to tier-correctly the Phase 2 features.

DO NOT build all three phases before validating Phase 1 with real
sidemen. The Pro Musician tier is a different product than what
GigWright is today and the right feature set is going to come out
of contact with real working musicians, not from the spec alone.

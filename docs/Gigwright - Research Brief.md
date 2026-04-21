# Where's The Gig Replacement — Research Brief

## What you actually want

You described it cleanly: a back-office for gigs that are already booked — date, venue, call time, personnel, pay, contacts, charts and set lists, notes — plus the thing that matters most, **every change you make fans out instantly to the people who need it: a text and an email to the musicians, and a calendar update to their iCloud or Google (they pick which one)**. You're the single source of truth. When you move the call time from 6 to 7, every musician's calendar event shifts, every phone buzzes with a text about the change, every inbox gets an updated email — all from one edit on your end.

That's a tighter product than what I was sketching before, and it's stronger because of it. It's not a marketplace, not a CRM with ambitions — it's a calendar-synced logistics spine for a working bandleader.

## Why this is the right definition

Nobody owns this job cleanly. Here's the current landscape.

**WTG** is the veteran, more feature-rich than I'd assumed for a 25-year-old product. It has gig records with venue, personnel, and setlist, bulk imports, personnel blackout dates, a public fan calendar, rehearsal planning, and mileage tracking for tax season. But it's free, the UI is from another era, its calendar sync is one-way (WTG → your calendar, not back), and it has no SMS at all — musician notifications are email-only via "Gig Alerts." Recent development has slowed to a handful of features a year.

**Band Pencil** is the modern-looking alternative. Strong on contracts, invoices, online payments, and both a client portal and a musician portal. But its own homepage doesn't highlight calendar integrations, direct messaging, or a mobile app — the three things that matter most for what you're describing.

**Back On Stage** is the heaviest of the modern ones. Auto-book and "shotgun book" via email/SMS until roles are filled, e-signed contracts, PayPal invoicing, Google Calendar sync. Priced $40–$120/month, aimed at bandleaders running 50+ gigs a year. Closest thing to what you want — but Google Calendar only (no iCloud), and the messaging is aimed at *filling* gigs rather than *updating* the band once they're booked.

**The opening is the product you described**: multi-provider two-way calendar sync — iCloud via CalDAV for you and other Apple musicians, Google for the Google crowd, Outlook later — paired with SMS and email notifications that fire on every gig edit, all driven by a single gig record you maintain. That combination isn't on the market.

## WTG parity we have to match

Without these, nobody switches. We build them, we don't try to innovate on them.

Gig record with the full field set (date, venue, call time, duration, per-musician role and pay, notes, attached documents). Setlist builder with a song library and duration math. Venue database with address, contact, map, and timezone. Personnel availability and blackout dates. Bulk imports from spreadsheet. Public calendar feed for fans via iCal URL. Multi-account management if you end up running more than one project.

## Where we win

Three things, in priority order.

**1. The sync spine.** When you edit a gig, within seconds every musician sees the updated event on whichever calendar they chose, gets an SMS that calls out the diff ("Call time changed from 6:00 to 7:00 PM"), and gets an updated email confirmation. One gig record, three channels, always in lockstep. This is the product.

**2. Per-musician communication preferences.** Each musician on your roster picks their own: calendar provider (iCloud/Google/Outlook), SMS on/off, email on/off. You don't manage their preferences — they do, once, on a self-serve page. You just add them to a gig and the system routes correctly.

**3. Gig Sheet on demand.** A one-page PDF per gig — date, venue with map link, call time, downbeat, dress, personnel, set list, pay, notes — that you can text or email with a single tap. Band Pencil and Back On Stage have pieces of this, but nobody has the "text me my gig sheet" button the way it should work at 8 AM on a gig day.

## Phase 1 build order

Weeks 1–2: Gig record and personnel database. iCloud (CalDAV) two-way sync for you personally — the hardest integration first so we de-risk it.

Weeks 3–4: Google Calendar two-way sync for other musicians. Musician self-serve preferences page.

Weeks 5–6: SMS (via Twilio) and email notifications triggered by gig edits. Diff-aware — only notify about what actually changed since last send.

Weeks 7–8: Setlist builder, gig sheet PDF generator, and file attachments (charts and set lists as PDFs per gig).

Contracts, invoices, online payments, and the public "Book Patrick" inquiry page move to Phase 1.5 or Phase 2. Revisit if one of those is make-or-break for you.

## Honest engineering notes

**iCloud two-way sync is the ugly one.** Apple supports CalDAV but requires app-specific passwords, rate limits are real, and change propagation from the musician's side is slow. We'll need a polling + webhook hybrid and a queue to handle retries. This is why it goes first — if we can't solve it, the whole premise collapses and we should know that early.

**SMS needs US A2P 10DLC registration** now that carriers enforce it. Twilio handles the filing but approval takes two to three weeks. We start that paperwork on day one so it's not blocking by week 5.

**Change-diff notifications** aren't hard but they're fiddly. Every gig edit becomes a revision; we compare the current state to the last state we notified from, and only ping on fields that actually changed. No "nothing changed but you got a text anyway" moments — that's what kills trust in a tool like this.

**Pluggable calendar providers from day one.** We don't hardcode iCloud. Calendar integration sits behind a provider interface with iCloud, Google, and Outlook implementations swappable per musician. Painful to retrofit, trivial if decided now.

## Where Cowork ends and Claude Code begins

Cowork (here) gets us: the two mockup screens that prove the product idea — the gig record you fill in, and the musician-side view of what they get on their phone when you edit. Plus this brief and any revisions.

Claude Code gets the build: Next.js + Postgres + Prisma on the backend, CalDAV/Google/Outlook provider layer, Twilio for SMS, transactional email (Resend or Postmark), file storage (S3 or equivalent) for attachments, auth for you plus musician self-serve, and a deploy pipeline. Budgeting realistically: two months of focused work to a usable v1.

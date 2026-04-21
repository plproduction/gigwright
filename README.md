# Gigwright

A back-office for booked gigs. One gig record. Every calendar, text, and inbox in lockstep.

Built for working bandleaders who need to manage date, venue, call time, personnel, pay, contacts, charts, and set lists — with the thing that matters most: **every edit fans out automatically**. Move the call time from 6 to 7, and every musician's calendar event shifts, every phone buzzes with the change, every inbox gets an updated email.

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript** + **Tailwind CSS v4**
- **Postgres** (Neon) via **Prisma 7** with the PG driver adapter
- **Auth.js v5** — passwordless magic-link auth, delivered via **Resend**
- **Vercel** for deployment

## Getting started locally

```bash
# 1. Install dependencies
npm install

# 2. Fill in .env (see .env.example for what each var does)
cp .env.example .env

# 3. Apply the schema to your Neon database
npm run db:migrate

# 4. (Optional) Load demo data
npx tsx prisma/seed.ts

# 5. Run the dev server
npm run dev
```

In development, magic-link sign-in emails are **printed to the server log instead of being sent** — copy the URL, paste it into your browser. In production, Resend delivers the real email.

## Project layout

```
app/
  (app)/                  # Authenticated app shell
    dashboard/            # Tonight + stats + gig list
    gigs/[id]/            # Three-column gig detail
    gigs/new, gigs/[id]/edit
    roster/               # Band member database
    venues/, finance/, settings/
  signin/                 # Magic-link sign-in
  api/auth/               # Auth.js endpoints
components/               # Shared UI (AppNav, forms)
lib/
  actions/                # Server actions (gig, venue, musician CRUD)
  db.ts                   # Prisma client singleton
  session.ts              # requireUser() helper
  format.ts               # Date/money/text helpers
  generated/prisma/       # Prisma client (git-ignored, regenerated on build)
prisma/
  schema.prisma
  seed.ts
auth.ts                   # Auth.js config (Node runtime)
auth.config.ts            # Edge-safe auth config (used by proxy.ts)
proxy.ts                  # Replaces middleware.ts in Next 16
```

## Environment variables

See `.env.example` for the full list. The required ones:

| Var | Where |
|---|---|
| `DATABASE_URL` | Neon → Connection string (pooled) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` dev, prod origin in prod |
| `AUTH_RESEND_KEY` | Resend → API Keys |
| `EMAIL_FROM` | Verified sender; default `onboarding@resend.dev` for dev |
| `TWILIO_*` | Twilio console — wired up in a follow-up once 10DLC is approved |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm run start` | Start the production build |
| `npm run db:migrate` | Apply schema changes to your local Neon branch |
| `npm run db:deploy` | Apply pending migrations (used on Vercel builds) |
| `npm run db:studio` | Open Prisma Studio, a GUI for the database |

## Status

**Phase 0 — Scaffolding & pipeline** ✓
- Auth, DB, deploy pipeline, full UI skeleton, CRUD for gigs/musicians/venues, seeded demo data, activity log.

**Phase 1 — The sync spine** (next)
1. iCloud CalDAV two-way sync (the hardest integration — go first to de-risk)
2. Google Calendar two-way sync
3. SMS + email alerts on gig edits (via Twilio; 10DLC registration is the long pole)
4. Gig sheet PDF, file attachments

See `docs/Gigwright - Research Brief.md` for the full product definition.

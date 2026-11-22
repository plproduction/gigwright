# GigWright — backup and restore

Written to be read in a bad moment. Start at "Something went wrong" and follow
one route. Everything here was tested end to end on 2026-11-22.

## What exists

| | |
|---|---|
| Live database | Neon project `gigwright` (`proud-pond-49262883`), Postgres 17, AWS us-east-1, Launch plan |
| Point-in-time restore | **7 days.** Neon can put the database back to any instant in the last week |
| Scheduled snapshots | **Not set up.** Neon offers daily / weekly / monthly on this plan — Backup & Restore → Edit schedule |
| Backups you own | `npm run db:backup` → a folder outside the repo, restorable anywhere |
| Rebuild from migrations | Works. Verified to reproduce the live structure exactly from an empty database |

Roughly 3,200 rows / 36 MB as of November 2026: 53 users, 289 musicians,
254 gigs, 158 venues. Small enough that a full backup takes seconds.

## Something went wrong

**A few rows got mangled, or something was deleted by accident, within the last 7 days.**
Use Neon point-in-time restore. Neon console → project `gigwright` → branch
`production` → **Backup & Restore** → pick the moment → **Preview data** first,
then **Restore**. This is the fastest route and loses nothing else.

**It happened more than 7 days ago.**
Neon can no longer help — its history window has passed. Use the most recent
backup folder (Route C), and expect to lose anything entered after it was taken.

**The whole database or the whole Neon project is gone.**
Route C, into a brand-new Neon project or any Postgres.

**A deploy applied a bad migration.**
Point-in-time restore to just before the deploy, then fix the migration and
deploy again. Migrations run only on production deploys
(`scripts/migrate-production-only.mjs`), so a preview cannot have caused it.

## Route C — restore a backup you own

1. Create the target: a new Neon project, a new branch, or any empty Postgres.
   **Never restore over a database that still has anything you want.**
2. Run it, pointing `RESTORE_DATABASE_URL` at the target:

   ```
   RESTORE_DATABASE_URL="postgres://…" npm run db:restore -- \
     --from "~/Documents/Claude/Projects/GigWright App/backups/gigwright-2026-11-22T21-48"
   ```

3. It rebuilds the structure with `prisma migrate deploy`, loads every row in
   foreign-key order, and then **checks every table against the manifest**. It
   exits with an error if even one count is off, so a silent half-restore is not
   a thing that can happen.
4. Point the app at the new database: `DATABASE_URL` in Netlify → Site settings
   → Environment variables, then redeploy.

Refusals are deliberate, not bugs:

- It stops if `RESTORE_DATABASE_URL` is on the same host as `DATABASE_URL` —
  that would be restoring over production.
- It stops if the target already has tables. `--force` wipes it first.
- If the migration chain is ever broken again, `--structure sql` rebuilds from
  the backup's own `structure.sql` and replays the recorded migration history
  instead. That is the second, independent route home.

## Taking a backup

```
npm run db:backup
```

Goes to `~/Documents/Claude/Projects/GigWright App/backups/gigwright-<timestamp>/`,
or wherever `GIGWRIGHT_BACKUP_DIR` points. Take one before anything structural:
a migration that drops or renames a column, a bulk edit, a data cleanup.

Each folder holds `structure.sql` (the whole schema as CREATE statements),
`data/<Table>.jsonl` (one row per line), `migrations.json` (the migration
history) and `manifest.json` (row counts and checksums, which the restore
verifies against).

**A backup folder is as sensitive as the database.** It contains session and
magic-link tokens, QuickBooks OAuth tokens, Stripe ids, and the name, phone
number and email of every musician and client on the platform — other people's
data, not just yours. `backups/` and `*.jsonl` are gitignored and the folders are
created `chmod 700`. Do not put one on a shared drive.

## The drill

A backup nobody has restored is a rumour. Once a quarter, and after any change
to the schema:

```
npm run db:backup
RESTORE_DATABASE_URL="postgres://…throwaway…" npm run db:restore -- --from <newest backup> --force
```

The restore verifies itself. If it prints `Restore is good.`, the plan works. On
2026-11-22 this was run for real: production → backup → empty Postgres → 3,157
rows restored, every table matching, and the app then booted against the
restored copy and rendered the dashboard.

## Why the migration chain was broken, and what was done

Until 2026-11-22, `prisma migrate deploy` could not build this database from
empty — which is what a restore does. Two separate faults:

1. **Order.** 42 of the 46 migration folders use a short 8-digit date prefix
   (`20260422_…`) rather than Prisma's 14-digit timestamp. Prisma orders
   migrations by the text before the first underscore, so a short prefix sorts
   *ahead* of a same-day long one, and ties within a day are alphabetical. Two
   pairs ran backwards as a result: `expense_paidat` before the migration that
   creates `GigExpense`, and `clear_founder_sender_email` before
   `user_sender_email` adds the column it clears. Deploy died at migration 3
   of 45. Those four files are now guarded and order-independent, and the
   sender-email seed was removed so a rebuild cannot reintroduce the unverified
   Resend address.

2. **Gaps.** Seven objects existed on production but in no migration — the
   `ExpenseKind` enum, `UserRole.MUSICIAN`, `GigExpense.kind/miles/days`,
   `Gig.loadingInfo/loadingMapUrl/loadingMapLink`, `Musician.w9RequestedAt`,
   and two foreign keys. They had been applied directly over the months and
   never written down, so a rebuild came up quietly missing columns the app
   reads. `20261126_repair_schema_history` adds them, every statement guarded so
   it is a no-op on any database that already has them, production included.

**If you add a migration, name the folder with a full 14-digit timestamp**
(`prisma migrate dev --name thing` does this), or the ordering bug comes back.

Verified afterwards: the chain replayed into an empty database produces a
structure byte-identical to production's, and `migrate deploy` against a
production-like database applies only the repair migration and changes nothing.

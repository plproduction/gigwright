<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations

**Name every migration folder with a full 14-digit timestamp**, which
`prisma migrate dev --name <thing>` does for you. Do not hand-create a folder
with a short date prefix like `20260422_thing`.

Prisma applies migrations in the order of the text before the first underscore,
so an 8-digit prefix sorts *ahead* of a same-day 14-digit one, and ties within a
day fall back to alphabetical order. 42 of this project's existing folders are
short-prefixed, and two pairs of them ran in the wrong order on a fresh database
until 2026-11-22 — `prisma migrate deploy` could not build the schema from
empty at all, which is exactly what a restore does.

Related rules, learned the same day:

- A migration that edits data must not assume a column exists if a same-day
  sibling adds it. Guard it, or fold it into the migration that adds the column.
- Never apply schema changes to production outside a migration (`prisma db push`
  against the live database, SQL by hand). Seven objects reached production that
  way and existed in no migration; a rebuild came up silently missing columns
  the app reads. See `20261126_repair_schema_history`.
- Editing an already-applied migration changes its checksum, which
  `prisma migrate deploy` ignores (only `migrate dev` objects). So making an old
  migration idempotent is safe for production — but verify it, don't assume it.
- Before anything structural, take a backup: `npm run db:backup`. The restore
  path and the recovery routes are in `docs/DISASTER_RECOVERY.md`.

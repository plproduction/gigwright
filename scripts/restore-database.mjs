// Restore a GigWright backup folder into an empty Postgres database.
//
// WHY THIS EXISTS
//
// A backup nobody has restored is a rumour. This is the other half of
// scripts/backup-database.mjs, and it is meant to be RUN -- against a throwaway
// database, on a schedule you can live with -- so that the day it matters is not
// the first time it has ever been tried.
//
// SAFETY
//
// The target comes from RESTORE_DATABASE_URL, deliberately NOT from
// DATABASE_URL, so a stray run cannot overwrite the live database. Pointing it
// at the same host as DATABASE_URL is refused outright. A target that already
// has tables is refused unless --force is passed, which drops and recreates the
// public schema first.
//
// HOW IT REBUILDS
//
// Structure comes from `prisma migrate deploy` by default, which also writes a
// correct _prisma_migrations, so the restored database is a normal GigWright
// database that migrates forward like any other. `--structure sql` uses the
// backup's own structure.sql instead and replays the recorded migration history
// verbatim -- the fallback for the day the migration chain is broken again.
//
// Rows go back through json_populate_recordset, which coerces arrays, jsonb,
// enums and timestamps server-side. Tables load parents-first in foreign-key
// order; any cycle falls back to disabling that table's triggers for the load.
//
// USAGE
//   RESTORE_DATABASE_URL=postgres://... node scripts/restore-database.mjs \
//     --from ~/Documents/.../backups/gigwright-2026-11-22T21-04
//   ... --force                 # wipe a non-empty target first
//   ... --structure sql         # rebuild from structure.sql, not migrations

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import "dotenv/config";

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
const flag = (name) => argv.includes(name);

const from = arg("--from");
const target = process.env["RESTORE_DATABASE_URL"];
const useSqlStructure = arg("--structure") === "sql";

if (!from) { console.error("Pass --from <backup folder>."); process.exit(1); }
if (!target) {
  console.error("Set RESTORE_DATABASE_URL to the database to restore INTO.");
  console.error("It is deliberately separate from DATABASE_URL so this cannot overwrite production.");
  process.exit(1);
}

const live = process.env["DATABASE_URL"];
const hostOf = (u) => { try { return new URL(u).host.replace("-pooler.", "."); } catch { return null; } };
if (live && hostOf(live) && hostOf(live) === hostOf(target)) {
  console.error("REFUSING: RESTORE_DATABASE_URL points at the same host as DATABASE_URL.");
  console.error("That is the live database. Restore into a throwaway or a new Neon branch.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(from, "manifest.json"), "utf8"));
console.log(`[restore] backup taken ${manifest.takenAt} from ${manifest.host}`);
console.log(`[restore] expecting ${manifest.totalRows} rows across ${Object.keys(manifest.tables).length} tables`);
console.log(`[restore] target host ${hostOf(target)}`);

// Verify the server certificate for a remote database; a local Postgres
// (the throwaway used for restore drills) speaks no SSL at all.
const isLocal = (u) => { try { return /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(new URL(u).host); } catch { return false; } };
const client = new pg.Client({ connectionString: target, ssl: isLocal(target) ? false : { rejectUnauthorized: true } });
await client.connect();

// ------------------------------------------------------------ empty target
const existing = await client.query(
  `SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
);
if (existing.rows[0].n > 0) {
  if (!flag("--force")) {
    console.error(`REFUSING: target already has ${existing.rows[0].n} tables. Pass --force to wipe it first.`);
    await client.end();
    process.exit(1);
  }
  console.log(`[restore] --force: dropping ${existing.rows[0].n} existing tables`);
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
}

// -------------------------------------------------------------- structure
if (useSqlStructure) {
  const sql = fs.readFileSync(path.join(from, "structure.sql"), "utf8");
  console.log("[restore] applying structure.sql");
  await client.query(sql);

  console.log("[restore] replaying recorded migration history");
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);
  const recorded = JSON.parse(fs.readFileSync(path.join(from, "migrations.json"), "utf8"));
  for (const m of recorded) {
    await client.query(
      `INSERT INTO "_prisma_migrations"
        ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5)`,
      [m.checksum, m.migration_name, m.started_at, m.finished_at, m.applied_steps_count],
    );
  }
  console.log(`[restore] ${recorded.length} migrations recorded`);
} else {
  console.log("[restore] building structure with `prisma migrate deploy`");
  const r = spawnSync("npx", ["--no-install", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: target },
  });
  if (r.status !== 0) {
    console.error("[restore] migrate deploy failed. Re-run with --structure sql to use the backup's own structure.sql.");
    await client.end();
    process.exit(1);
  }
}

// ------------------------------------------------- foreign-key load order
const { rows: edges } = await client.query(`
  SELECT src.relname AS child, tgt.relname AS parent
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
   WHERE c.contype = 'f'`);

const dataDir = path.join(from, "data");
const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".jsonl"));
const all = files.map((f) => f.replace(/\.jsonl$/, ""));

const parents = new Map(all.map((t) => [t, new Set()]));
for (const { child, parent } of edges) {
  if (child !== parent && parents.has(child) && parents.has(parent)) parents.get(child).add(parent);
}
const order = [];
const placed = new Set();
while (order.length < all.length) {
  const ready = all.filter((t) => !placed.has(t) && [...parents.get(t)].every((p) => placed.has(p)));
  if (ready.length === 0) {
    // A cycle. Load what is left with triggers off for those tables.
    const left = all.filter((t) => !placed.has(t));
    console.log(`[restore] foreign-key cycle among ${left.join(", ")} — loading those with triggers disabled`);
    for (const t of left) { order.push(t); placed.add(t); }
    order.cycleFrom = order.length - left.length;
    break;
  }
  for (const t of ready.sort()) { order.push(t); placed.add(t); }
}

// ---------------------------------------------------------------- the rows
let loaded = 0;
const actual = {};
for (const [i, t] of order.entries()) {
  const body = fs.readFileSync(path.join(dataDir, `${t}.jsonl`), "utf8").trim();
  const rows = body ? body.split("\n").map((l) => JSON.parse(l)) : [];
  actual[t] = rows.length;
  if (rows.length === 0) continue;
  const inCycle = order.cycleFrom !== undefined && i >= order.cycleFrom;
  if (inCycle) await client.query(`ALTER TABLE "${t}" DISABLE TRIGGER ALL`);
  await client.query(
    `INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`,
    [JSON.stringify(rows)],
  );
  if (inCycle) await client.query(`ALTER TABLE "${t}" ENABLE TRIGGER ALL`);
  loaded += rows.length;
  console.log(`[restore]   ${t} ${rows.length}`);
}

// ------------------------------------------------------------- verification
const problems = [];
for (const [t, expected] of Object.entries(manifest.tables)) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${t}"`);
  if (rows[0].n !== expected) problems.push(`${t}: expected ${expected}, found ${rows[0].n}`);
}
await client.end();

console.log(`[restore] loaded ${loaded} rows`);
if (problems.length) {
  console.error("[restore] ROW COUNTS DO NOT MATCH THE MANIFEST:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`[restore] verified: every table matches the manifest (${manifest.totalRows} rows). Restore is good.`);

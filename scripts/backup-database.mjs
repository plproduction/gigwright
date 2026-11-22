// Take a full, self-contained backup of the GigWright database.
//
// WHY THIS EXISTS
//
// Neon holds the live database and can restore it to a point in time, but that
// is the provider's copy, inside the provider's account, for a limited window.
// It is not a backup you own. This script produces one you do: a folder you can
// copy anywhere, that restores into any empty Postgres with
// scripts/restore-database.mjs.
//
// There is no pg_dump on the operator's machine, so this does not shell out to
// it. Structure comes from Prisma; data comes out as one JSON object per row
// (`row_to_json`), which round-trips arrays, jsonb, enums and timestamps without
// hand-written type handling -- `json_populate_record` puts them back on the
// way in.
//
// WHAT LANDS IN THE FOLDER
//
//   structure.sql        every table, enum, index and constraint, as CREATE
//                        statements. An independent second route back: if the
//                        migration chain ever breaks again, this still rebuilds
//                        the schema on its own.
//   data/<Table>.jsonl   one row per line.
//   migrations.json      the contents of _prisma_migrations, so a restored
//                        database reports the same history and the next
//                        `prisma migrate deploy` is a no-op instead of trying
//                        to replay 46 migrations over a populated schema.
//   manifest.json        timestamp, row count per table, totals, structure
//                        checksum. restore-database.mjs verifies against this.
//
// THE BACKUP CONTAINS SECRETS AND OTHER PEOPLE'S PERSONAL DATA: session tokens,
// magic-link tokens, QuickBooks OAuth tokens, Stripe ids, and the names, phone
// numbers and email addresses of every musician and client on the platform.
// Keep it off version control (the default directory is outside the repo and
// chmod 700) and off any shared drive you would not put a payroll file on.
//
// USAGE
//   npm run db:backup                 # uses DATABASE_URL from .env
//   GIGWRIGHT_BACKUP_DIR=/Volumes/x npm run db:backup

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import "dotenv/config";

const pooled = process.env["DATABASE_URL"];
if (!pooled) {
  console.error("DATABASE_URL is not set. Put it in .env or pass it inline.");
  process.exit(1);
}
// Same reasoning as prisma.config.ts: do administrative work over the direct
// endpoint, not Neon's transaction pooler.
const url = process.env["DIRECT_URL"] ?? pooled.replace("-pooler.", ".");

const baseDir =
  process.env["GIGWRIGHT_BACKUP_DIR"] ??
  path.join(os.homedir(), "Documents", "Claude", "Projects", "GigWright App", "backups");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const outDir = path.join(baseDir, `gigwright-${stamp}`);
fs.mkdirSync(path.join(outDir, "data"), { recursive: true });
fs.chmodSync(baseDir, 0o700);
fs.chmodSync(outDir, 0o700);

console.log(`[backup] ${outDir}`);

// ---------------------------------------------------------------- structure
// Prisma renders the whole live schema as CREATE statements. --from-empty
// --to-config-datasource means "what would it take to build what is actually
// there", which is the real structure, not what schema.prisma claims.
const structurePath = path.join(outDir, "structure.sql");
const diff = spawnSync(
  "npx",
  ["--no-install", "prisma", "migrate", "diff", "--from-empty", "--to-config-datasource", "--script"],
  { encoding: "utf8", env: { ...process.env, DATABASE_URL: pooled } },
);
if (diff.status !== 0) {
  console.error("[backup] prisma migrate diff failed:\n" + (diff.stderr || diff.stdout));
  process.exit(1);
}
fs.writeFileSync(structurePath, diff.stdout, { mode: 0o600 });
const structureSha = crypto.createHash("sha256").update(diff.stdout).digest("hex");
console.log(`[backup] structure.sql  ${diff.stdout.split("\n").length} lines  sha256 ${structureSha.slice(0, 12)}…`);

// --------------------------------------------------------------------- data
// Verify the server certificate for a remote database; a local Postgres
// (the throwaway used for restore drills) speaks no SSL at all.
const isLocal = (u) => { try { return /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(new URL(u).host); } catch { return false; } };
const client = new pg.Client({ connectionString: url, ssl: isLocal(url) ? false : { rejectUnauthorized: true } });
await client.connect();

const { rows: tables } = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
    ORDER BY table_name`,
);

const counts = {};
let total = 0;
for (const { table_name: t } of tables) {
  if (t === "_prisma_migrations") continue; // captured separately, below
  const { rows } = await client.query(`SELECT row_to_json(x) AS j FROM "${t}" x`);
  const body = rows.map((r) => JSON.stringify(r.j)).join("\n");
  fs.writeFileSync(path.join(outDir, "data", `${t}.jsonl`), body ? body + "\n" : "", { mode: 0o600 });
  counts[t] = rows.length;
  total += rows.length;
}

// Migration history, so a restored database does not try to replay itself.
const { rows: migrations } = await client.query(
  `SELECT migration_name, checksum, started_at, finished_at, applied_steps_count
     FROM "_prisma_migrations" ORDER BY started_at`,
);
fs.writeFileSync(path.join(outDir, "migrations.json"), JSON.stringify(migrations, null, 2), { mode: 0o600 });

await client.end();

// ----------------------------------------------------------------- manifest
const manifest = {
  takenAt: new Date().toISOString(),
  host: (() => { try { return new URL(url).host; } catch { return "unknown"; } })(),
  tables: counts,
  totalRows: total,
  migrationCount: migrations.length,
  lastMigration: migrations.at(-1)?.migration_name ?? null,
  structureSha256: structureSha,
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });

const width = Math.max(...Object.keys(counts).map((k) => k.length));
for (const [t, n] of Object.entries(counts)) {
  if (n > 0) console.log(`           ${t.padEnd(width)}  ${String(n).padStart(5)}`);
}
console.log(`[backup] ${total} rows, ${Object.keys(counts).length} tables, ${migrations.length} migrations recorded`);
console.log(`[backup] done — ${outDir}`);
console.log(`[backup] restore with:  node scripts/restore-database.mjs --from "${outDir}"`);

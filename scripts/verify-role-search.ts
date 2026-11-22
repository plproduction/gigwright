// Acceptance test for the role cleanup: does the top-right search still
// find the same people?
//
//   npx tsx scripts/verify-role-search.ts --owner=patrick@patricklamb.com
//
// Before the cleanup, searching "miami" worked by accident — the role was
// literally named "Drums Miami", and the search matches on role names. After
// it, the role is "Drums" and "Miami" lives in RoleMember.note. If the note
// isn't folded into the search haystack, that capability disappears silently:
// no error, no empty page, just a bass player in Miami you can no longer find.
//
// The "before" answer is not guesswork. `_MusicianRolesBackup` holds every
// original free-text role string, captured before the 2026-11-23 migration
// dropped the column. So for each term we can ask:
//
//   expected = people whose ORIGINAL free-text roles contained the term
//   actual   = people the search returns NOW
//
// and any name in expected but not actual is a regression.

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WITH_ROLES, roleNames, roleNotes } from "../lib/musician-roles";

const TERMS = [
  "miami", "ohio", "palm beach", "orlando", "tucson", "dc",
  "rogue valley", "greg parnell", "dave iula", "mark falchook",
  "detroit", "florida", "arizona", "delray", "la",
  // instrument words must still work, including through the alias table
  "bass", "drums", "guitar", "piano", "pianist", "keys", "sax", "vocals",
  "trumpet", "flugel", "fiddle", "steel drum",
  // multi-word, both orders
  "drums miami", "miami drums", "guitar ohio", "ohio guitar",
];

const ROLE_ALIASES: { words: string[]; match: string[] }[] = [
  { words: ["key", "keys", "keyboard", "keyboards", "keyboardist", "keybaords", "piano", "pianist"], match: ["key", "piano"] },
  { words: ["drum", "drums", "drummer", "drummers"], match: ["drum"] },
  { words: ["bass", "bassist"], match: ["bass"] },
  { words: ["sax", "saxophone", "saxophonist"], match: ["sax"] },
  { words: ["guitar", "guitarist", "gtr"], match: ["guitar", "gutiar"] },
  { words: ["vocal", "vocals", "vocalist", "singer", "singers", "voice"], match: ["vocal", "singer"] },
  { words: ["perc", "percussion", "percussionist"], match: ["perc"] },
  { words: ["steel drum", "steel drums", "steel pan", "steelpan", "pan"], match: ["steel"] },
  { words: ["flugel", "flugelhorn", "flugelhorns"], match: ["flugel"] },
  { words: ["horn", "horns", "horn section"], match: ["sax", "trumpet", "trombone", "flugel"] },
  { words: ["fiddle", "violin", "violinist"], match: ["violin", "fiddle"] },
  { words: ["dj", "deejay"], match: ["dj"] },
];

function needlesFor(term: string): string[] {
  const alias = ROLE_ALIASES.find((a) => a.words.includes(term));
  if (alias) return [term, ...alias.match];
  const stem = term.replace(/(ists?|ers?|s)$/, "");
  return stem.length >= 2 && stem !== term ? [term, stem] : [term];
}

function matches(text: string, q: string): boolean {
  if (needlesFor(q).some((n) => text.includes(n))) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.length > 1 && terms.every((t) => needlesFor(t).some((n) => text.includes(n)));
}

const ownerArg = process.argv.find((a) => a.startsWith("--owner="));
const OWNER_EMAIL = ownerArg?.slice("--owner=".length);

async function main() {
  if (!OWNER_EMAIL) throw new Error("--owner=<email> is required");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const owner = await db.user.findUniqueOrThrow({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });

  const musicians = await db.musician.findMany({
    where: { ownerId: owner.id },
    select: { id: true, name: true, email: true, phone: true, notes: true, ...WITH_ROLES },
  });

  // The "before" picture, straight from the backup table.
  const backup = await db.$queryRawUnsafe<
    { musicianId: string; roles: string[] }[]
  >(`SELECT "musicianId", "roles" FROM "_MusicianRolesBackup" WHERE "ownerId" = $1`, owner.id);
  const originalById = new Map(backup.map((b) => [b.musicianId, b.roles ?? []]));
  const nameById = new Map(musicians.map((m) => [m.id, m.name]));

  let failures = 0;
  console.log(`\n${musicians.length} musicians · ${backup.length} rows in _MusicianRolesBackup\n`);

  for (const term of TERMS) {
    // Expected: anyone whose ORIGINAL free-text roles matched this term.
    const expected = new Set<string>();
    for (const [id, roles] of originalById) {
      const text = roles.join(" \n ").toLowerCase();
      if (matches(text, term)) expected.add(id);
    }

    // Actual: what the search returns now, same haystack the route builds.
    const actual = new Set<string>();
    for (const m of musicians) {
      const text = [m.name, m.email, m.phone, ...roleNames(m), ...roleNotes(m), m.notes]
        .filter(Boolean)
        .join(" \n ")
        .toLowerCase();
      if (matches(text, term)) actual.add(m.id);
    }

    const lost = [...expected].filter((id) => !actual.has(id));
    const gained = [...actual].filter((id) => !expected.has(id));
    const status = lost.length === 0 ? "ok  " : "LOST";
    if (lost.length) failures++;
    console.log(
      `${status} ${term.padEnd(14)} before ${String(expected.size).padStart(3)} · now ${String(actual.size).padStart(3)}` +
        (gained.length ? ` · +${gained.length} new` : "") +
        (lost.length ? `  ← ${lost.map((id) => nameById.get(id)).join(", ")}` : ""),
    );
  }

  console.log(
    failures === 0
      ? "\n✓ no search regressions — every term still finds everyone it used to\n"
      : `\n✗ ${failures} term(s) lost people. Do not ship.\n`,
  );
  if (failures) process.exitCode = 1;
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

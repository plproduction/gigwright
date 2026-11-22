// Collapse the free-text roles into a canonical list, keeping everything else.
//
//   node scripts/cleanup-roles.mjs --dry-run     # print the plan, write nothing
//   node scripts/cleanup-roles.mjs --apply       # do it
//
// Background: the 2026-11-23 migration folded Musician.roles (free text) into
// real Role rows, faithfully — and produced 123 "roles", because the field had
// been used as a notes field: instrument + city + who referred them. This
// script turns those into 28 canonical roles without losing the rest.
//
// Three things happen to each old role name:
//
//   roles: [...]   one or more canonical roles the member moves onto. More
//                  than one is NOT an edge case — "Guitar Vocals" is somebody
//                  who does both, and they must appear on both call lists or
//                  they vanish when you go looking for a singer.
//   note:          the leftover detail, kept on the membership. "Miami",
//                  "referred by Greg Parnell", "Prince tribute". This is the
//                  most useful thing in the old data and is searchable.
//   toNotes:       not a role at all — an engagement or an organisation.
//                  Appended to that person's Musician.notes, because most of
//                  these people are not on a gig right now and attaching it to
//                  an event would lose it.
//
// Safety: before deleting an old Role, every GigPersonnel.roleId and
// LineupRole.roleId pointing at it is remapped to the canonical role.
// GigPersonnel.role is onDelete: SetNull (survivable) but LineupRole.role is
// onDelete: CASCADE — deleting a role out from under a lineup would delete the
// lineup's row for that chair outright. Remap first, always.

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const INSTRUMENTS = [
  "Bass", "Drums", "Percussion", "Steel Drum", "Guitar", "Keyboards",
  "Saxophone", "Trumpet", "Trombone", "Clarinet", "Flute", "Violin",
  "Strings", "Vocals",
];
const CREW = [
  "Event Producer", "Music Director", "Sound", "Engineer", "Production",
  "Tour Manager", "MC / Host", "Merch", "Loader", "Lights", "DJ", "Dance",
  "Arranger", "Sponsor",
];
const CANONICAL = [...INSTRUMENTS, ...CREW];

type Spec = {
  /** Canonical roles this member moves onto. More than one is normal. */
  roles: string[];
  /** Leftover detail, kept on the membership and searchable. */
  note: string | null;
  /** Not a role — goes to the person's notes instead. */
  toNotes?: boolean;
};

const r = (roles: string[], note: string | null = null): Spec => ({ roles, note });
const n = (): Spec => ({ roles: [], note: null, toNotes: true });

// Every one of the 123 strings, explicitly. Explicit beats clever: a regex
// that collapses "Bass Miami" also collapses "Bass / Piano MD" wrongly, and
// nobody reviewing it would notice.
const MAP: Record<string, Spec> = {
  // ── Bass ────────────────────────────────────────────────────────
  "BASS": r(["Bass"]),
  "Bass DC Area": r(["Bass"], "DC area"),
  "Bass Miami": r(["Bass"], "Miami"),
  "Bass Ohio": r(["Bass"], "Ohio"),
  "Bass Orlando": r(["Bass"], "Orlando"),
  "Bass Touscon": r(["Bass"], "Tucson"),
  "Bass Vocals": r(["Bass", "Vocals"]),
  "Bass / Piano MD": r(["Bass", "Keyboards", "Music Director"]),

  // ── Drums & percussion ──────────────────────────────────────────
  "Drums": r(["Drums"]),
  "Drummer": r(["Drums"]),
  "Drums Arizona": r(["Drums"], "Arizona"),
  "Drums Florida": r(["Drums"], "Florida"),
  "Drums Florida Referred by Mark Falchook": r(["Drums"], "Florida — referred by Mark Falchook"),
  "Drums Los Angeles et al": r(["Drums"], "Los Angeles"),
  "Drums Miami": r(["Drums"], "Miami"),
  "Drums Palm Beach": r(["Drums"], "Palm Beach"),
  "Drums referred by Greg Parnell": r(["Drums"], "referred by Greg Parnell"),
  "Drums/ Percussion": r(["Drums", "Percussion"]),
  "Drums Sound": r(["Drums", "Sound"]),
  "Drums Producer Writer Engineer": r(["Drums", "Event Producer", "Engineer"], "writer"),
  "Percussion": r(["Percussion"]),
  "Steel Drum": r(["Steel Drum"]),

  // ── Guitar ──────────────────────────────────────────────────────
  "Guitar": r(["Guitar"]),
  "Guitar DC": r(["Guitar"], "DC"),
  "Guitar Delray Beach": r(["Guitar"], "Delray Beach"),
  "Guitar Ohio": r(["Guitar"], "Ohio"),
  "Guitar Orlando": r(["Guitar"], "Orlando"),
  "Guitar Palm Beach": r(["Guitar"], "Palm Beach"),
  "Guitar referral Dave Iula": r(["Guitar"], "referral Dave Iula"),
  "Guitar Vocals": r(["Guitar", "Vocals"]),

  // ── Keyboards (Piano folds in — Patrick, 2026-11-22) ────────────
  "Keyboards": r(["Keyboards"]),
  "Keyboard": r(["Keyboards"]),
  "Keybaords": r(["Keyboards"]),
  "Keys": r(["Keyboards"]),
  "Piano": r(["Keyboards"]),
  "Piano Keys": r(["Keyboards"]),
  "Piano Keyboards": r(["Keyboards"]),
  "Keys Piano Miami": r(["Keyboards"], "Miami"),
  "Piano Florida": r(["Keyboards"], "Florida"),
  "Piano keys Eugene Junction city": r(["Keyboards"], "Eugene / Junction City"),
  "Piano / Engineer": r(["Keyboards", "Engineer"]),
  "Piano Arranging": r(["Keyboards", "Arranger"]),
  "MD Piano": r(["Music Director", "Keyboards"]),

  // ── Horns & strings ─────────────────────────────────────────────
  "Sax": r(["Saxophone"]),
  "Saxophone": r(["Saxophone"]),
  "Saxophone LA": r(["Saxophone"], "LA"),
  "Trumpet": r(["Trumpet"]),
  "Flugel": r(["Trumpet"], "flugelhorn"),
  "Trombone": r(["Trombone"]),
  "Clarinet": r(["Clarinet"]),
  "Flute": r(["Flute"]),
  "Violin": r(["Violin"]),
  "Strings / Contractor / Arranger": r(["Strings", "Arranger"], "contractor"),

  // ── Vocals ──────────────────────────────────────────────────────
  "Vocals": r(["Vocals"]),
  "Vocalist": r(["Vocals"]),
  "Lead": r(["Vocals"], "lead"),
  "Vocals Guitar": r(["Vocals", "Guitar"]),
  "Vocals Gutiar": r(["Vocals", "Guitar"]),
  "Vocals Dance": r(["Vocals", "Dance"]),
  "Vocals and Production TV Radio": r(["Vocals", "Production"], "TV / radio"),
  "Vocals Gt Prince Tribute": r(["Vocals", "Guitar"], "Prince tribute"),
  "Vocals Journey Infinity": r(["Vocals"], "Journey tribute (Infinity)"),
  "Vocals Turnstiles": r(["Vocals"], "Turnstiles (Billy Joel tribute)"),

  // ── Sound / Engineer / Production (kept separate — Patrick) ─────
  "Sound": r(["Sound"]),
  "Sound Tech": r(["Sound"]),
  "Sound Production": r(["Sound"]),
  "Sound and Production": r(["Sound", "Production"]),
  "Sound Production Engineer": r(["Sound", "Engineer"]),
  "Sound Production Manager": r(["Sound", "Production"], "production manager"),
  "Sound at Rogue Valley": r(["Sound"], "Rogue Valley"),
  "Sound / Saxophone": r(["Sound", "Saxophone"]),
  "Sound / Loading": r(["Sound", "Loader"]),
  "Loading Unloading Sound": r(["Loader", "Sound"]),
  "Engineer": r(["Engineer"]),
  "Loader Engineer": r(["Loader", "Engineer"]),
  "Loading": r(["Loader"]),
  "Production": r(["Production"]),
  "Lead Production": r(["Production"], "lead"),
  "Lights/ Help/ Staging": r(["Lights"], "staging"),

  // ── Producers, MDs, managers ────────────────────────────────────
  "PRODUCER": r(["Event Producer"]),
  "Producer Detroit": r(["Event Producer"], "Detroit"),
  "Producer of OTE Columbus": r(["Event Producer"], "OTE Columbus"),
  "Producer Conway SC Gerald Albright Patrick Lamb": r(["Event Producer"], "Conway SC — Gerald Albright / Patrick Lamb"),
  "Atlanta Perfect Note Producer": r(["Event Producer"], "Atlanta — Perfect Note"),
  "MD OTE": r(["Music Director"], "OTE"),
  "MD Jazz in the Park": r(["Music Director"], "Jazz in the Park"),
  "MD BBQ VENUE": r(["Music Director"], "BBQ venue"),
  "Tour Manager": r(["Tour Manager"]),
  "Jason Scheff Manager": r(["Tour Manager"], "Jason Scheff"),
  "Jason Scheff assistant production manager": r(["Production"], "Jason Scheff — assistant production manager"),

  // ── Odds and ends that are still real roles ─────────────────────
  "Arranger": r(["Arranger"]),
  "Arranging": r(["Arranger"]),
  "DJ": r(["DJ"]),
  "Dance": r(["Dance"]),
  "Merch": r(["Merch"]),
  "Merchandise": r(["Merch"]),
  "MC": r(["MC / Host"]),
  "Host": r(["MC / Host"]),
  "Sponsor": r(["Sponsor"]),

  // ── Not roles — these describe an engagement or an organisation ──
  "Exclusive Food Truck Vendor": n(),
  "Children's Choir Director": n(),
  "Choir Director": n(),
  "Choir Leader / Teacher Three Rivers School": n(),
  "Chorale Leader": n(),
  "Central Oregon Mastersingers": n(),
  "Coaster Theatre Executive Producer": n(),
  "Delray Choir Youth Group Leader": n(),
  "Delray Events": n(),
  "Director at The Achievement Centers for Children & Families": n(),
  "Platinum Steppers Leader": n(),
  "School Of Rock Leader": n(),
  "Jazz in the Park": n(),
  "MHCC ADMIN CONTACT": n(),
  "President": n(),
  "Johnson": n(),
  "Entertainer": n(),
  "Ben Rice and PDX Hustle": n(),
  "Hit Machine Band": n(),
  "Hometown Sound Band": n(),
  "Mountaintop Sound": n(),
  "Powder Keg Band": n(),
  "The Expanding Man (Steely Dan tribute)": n(),
  "The Young Singers of The Palm Beaches": n(),
};

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

// Scoped to one account on purpose. This mapping was derived by reading
// ONE bandleader's free-text roles; another tenant's "Lead" or "Production"
// may mean something else entirely, and quietly reshaping their roster
// while cleaning up ours would be indefensible. Required argument, no
// default — there is no "all owners" mode.
const ownerArg = process.argv.find((a) => a.startsWith("--owner="));
const OWNER_EMAIL = ownerArg?.slice("--owner=".length);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!OWNER_EMAIL) {
    throw new Error(
      "--owner=<email> is required. This script only ever touches one account.",
    );
  }
  console.log(`\n${DRY ? "DRY RUN — nothing will be written" : "APPLYING"}`);
  console.log(`db:    ${url.replace(/:[^:@/]+@/, ":****@").split("?")[0]}`);
  console.log(`owner: ${OWNER_EMAIL}\n`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const owners = await db.user.findMany({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (owners.length === 0) throw new Error(`No user with email ${OWNER_EMAIL}`);
  const grandTotals = {
    roles: 0,
    memberships: 0,
    notes: 0,
    unmapped: [] as string[],
  };

  for (const owner of owners) {
    const oldRoles = await db.role.findMany({
      where: { ownerId: owner.id },
      include: { members: { orderBy: { callOrder: "asc" } } },
      orderBy: { position: "asc" },
    });
    if (oldRoles.length === 0) continue;

    // Anything not in MAP stops the run. Silently dropping a role nobody
    // anticipated is exactly how data goes missing.
    const unmapped = oldRoles
      .map((x) => x.name)
      .filter((nm) => !CANONICAL.includes(nm) && !(nm in MAP));
    if (unmapped.length) {
      grandTotals.unmapped.push(...unmapped);
      console.log(`!! ${owner.email}: ${unmapped.length} unmapped role(s):`);
      for (const u of unmapped) console.log(`     "${u}"`);
      console.log("   Add them to MAP and re-run. Nothing written for this owner.\n");
      continue;
    }

    // Plan: canonical role name → musicianId → { note, firstSeenOrder }
    type Entry = { notes: string[]; order: number };
    const plan = new Map<string, Map<string, Entry>>();
    const musicianNotes = new Map<string, string[]>(); // musicianId → [text]
    for (const role of oldRoles) {
      const spec = CANONICAL.includes(role.name)
        ? { roles: [role.name], note: null }
        : MAP[role.name];
      for (const m of role.members) {
        if (spec.toNotes) {
          const list = musicianNotes.get(m.musicianId) ?? [];
          list.push(role.name);
          musicianNotes.set(m.musicianId, list);
          continue;
        }
        for (const target of spec.roles) {
          if (!plan.has(target)) plan.set(target, new Map<string, Entry>());
          const bucket = plan.get(target)!;
          const existing = bucket.get(m.musicianId);
          if (existing) {
            // Someone reached the same canonical role down two paths
            // ("Guitar Ohio" and "Guitar Vocals"). Keep both notes.
            if (spec.note && !existing.notes.includes(spec.note)) {
              existing.notes.push(spec.note);
            }
            existing.order = Math.min(existing.order, m.callOrder);
          } else {
            bucket.set(m.musicianId, {
              notes: spec.note ? [spec.note] : [],
              order: m.callOrder,
            });
          }
        }
      }
    }

    console.log(`── ${owner.email}`);
    console.log(`   ${oldRoles.length} roles → ${plan.size} canonical`);
    for (const [name, bucket] of [...plan].sort()) {
      const withNotes = [...bucket.values()].filter((v) => v.notes.length).length;
      console.log(
        `   ${name.padEnd(16)} ${String(bucket.size).padStart(3)} on call list` +
          (withNotes ? `, ${withNotes} with a note` : ""),
      );
    }
    if (musicianNotes.size) {
      console.log(`   ${musicianNotes.size} people get an engagement note instead of a role`);
    }
    grandTotals.roles += plan.size;
    grandTotals.memberships += [...plan.values()].reduce((s, b) => s + b.size, 0);
    grandTotals.notes += musicianNotes.size;

    if (DRY) { console.log(""); continue; }

    // Engagement notes first, OUTSIDE the transaction. They're idempotent
    // (each text is only appended if absent), they touch no role data, and
    // keeping 24 round trips out of the transaction is 24 fewer seconds the
    // write lock is held.
    for (const [musicianId, texts] of musicianNotes) {
      const m = await db.musician.findUnique({
        where: { id: musicianId },
        select: { notes: true },
      });
      const current = m?.notes ?? "";
      const add = texts.filter((t) => !current.includes(t));
      if (!add.length) continue;
      await db.musician.update({
        where: { id: musicianId },
        data: { notes: [current.trim(), ...add].filter(Boolean).join("\n") },
      });
    }

    // Everything that reshapes roles goes in one transaction, built out of
    // bulk statements. The obvious row-at-a-time version needs ~400 round
    // trips to us-east-1 and blew the 120s transaction timeout; this is
    // about 60, because the 279 memberships go in a single createMany.
    await db.$transaction(async (tx) => {
      const oldIds = oldRoles.map((x) => x.id);

      // 1. Clear every membership for this owner. They are all about to be
      //    rebuilt from the plan, which is also what renumbers callOrder.
      await tx.roleMember.deleteMany({ where: { roleId: { in: oldIds } } });

      // 2. Canonical roles, in the order declared at the top of this file so
      //    the Band page reads instruments-then-crew, not alphabetical.
      const canonicalId = new Map<string, string>();
      let position = 0;
      for (const name of CANONICAL) {
        if (!plan.has(name)) continue;
        const existing = oldRoles.find((x) => x.name === name);
        const row = existing
          ? await tx.role.update({
              where: { id: existing.id },
              data: { position: position++ },
            })
          : await tx.role.create({
              data: { ownerId: owner.id, name, position: position++ },
            });
        canonicalId.set(name, row.id);
      }

      // 3. All memberships in one statement.
      const rows = [];
      for (const [name, bucket] of plan) {
        const roleId = canonicalId.get(name)!;
        const ordered = [...bucket].sort((a, b) => a[1].order - b[1].order);
        let callOrder = 0;
        for (const [musicianId, v] of ordered) {
          rows.push({
            roleId,
            musicianId,
            callOrder: callOrder++,
            note: v.notes.length ? v.notes.join(" · ") : null,
          });
        }
      }
      await tx.roleMember.createMany({ data: rows, skipDuplicates: true });

      // 4. Repoint anything referencing a role about to be deleted, grouped
      //    by destination so it's one statement per canonical role rather
      //    than one per old role. GigPersonnel.role is onDelete: SetNull,
      //    survivable — but LineupRole.role is onDelete: CASCADE, so without
      //    this a lineup's chair would be deleted outright, not just unlinked.
      const doomed = oldRoles.filter((x) => !canonicalId.has(x.name));
      const byTarget = new Map<string, string[]>();
      for (const old of doomed) {
        const spec = MAP[old.name];
        const target = spec && !spec.toNotes ? spec.roles[0] : null;
        const newId = target ? canonicalId.get(target) : null;
        if (!newId) continue;
        byTarget.set(newId, [...(byTarget.get(newId) ?? []), old.id]);
      }
      for (const [newId, ids] of byTarget) {
        await tx.gigPersonnel.updateMany({
          where: { roleId: { in: ids } },
          data: { roleId: newId },
        });
        for (const lr of await tx.lineupRole.findMany({
          where: { roleId: { in: ids } },
        })) {
          const clash = await tx.lineupRole.findFirst({
            where: { lineupId: lr.lineupId, roleId: newId },
          });
          // The lineup already has the canonical chair: fold the count in
          // rather than violating @@unique([lineupId, roleId]).
          if (clash) {
            await tx.lineupRole.update({
              where: { id: clash.id },
              data: { count: clash.count + lr.count },
            });
            await tx.lineupRole.delete({ where: { id: lr.id } });
          } else {
            await tx.lineupRole.update({
              where: { id: lr.id },
              data: { roleId: newId },
            });
          }
        }
      }

      // 5. The old roles, in one statement.
      await tx.role.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
    }, { timeout: 300_000, maxWait: 30_000 });

    console.log(`   ✓ written\n`);
  }

  console.log("── total");
  console.log(`   canonical roles: ${grandTotals.roles}`);
  console.log(`   memberships:     ${grandTotals.memberships}`);
  console.log(`   people noted:    ${grandTotals.notes}`);
  if (grandTotals.unmapped.length) {
    console.log(`   UNMAPPED:        ${grandTotals.unmapped.length} — nothing was written for those owners`);
    process.exitCode = 1;
  }
  if (DRY) console.log("\nDry run. Re-run with --apply to write.\n");

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

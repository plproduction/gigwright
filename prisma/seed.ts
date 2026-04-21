/**
 * Seed script — creates a realistic demo dataset for Patrick's bandleader
 * workflow so the app isn't empty on first load.
 *
 * Run with:  npm_config_cache=/tmp/gigwright-npm-cache npx tsx prisma/seed.ts
 */

import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const OWNER_EMAIL = "patrick@patricklamb.com";

const ROSTER: Array<{
  name: string;
  email?: string;
  initials: string;
  roles: string[];
  isLeader?: boolean;
  calendarProvider: "ICLOUD" | "GOOGLE" | "OUTLOOK" | "NONE";
  paymentMethod?:
    | "VENMO"
    | "PAYPAL"
    | "ZELLE"
    | "CASHAPP"
    | "CASH"
    | "CHECK"
    | "DIRECT_DEPOSIT"
    | "OTHER";
}> = [
  { name: "Patrick Lamb", email: OWNER_EMAIL, initials: "PL", roles: ["Leader", "Sax", "Vocals"], isLeader: true, calendarProvider: "ICLOUD" },
  { name: "Dave Reinhardt", initials: "DR", roles: ["Drums"], calendarProvider: "ICLOUD", paymentMethod: "ZELLE" },
  { name: "Tim George", initials: "TG", roles: ["Bass"], calendarProvider: "GOOGLE", paymentMethod: "VENMO" },
  { name: "Alex Budman", initials: "AB", roles: ["Sax", "Arranger"], calendarProvider: "GOOGLE", paymentMethod: "PAYPAL" },
  { name: "Adam Carlson", initials: "AC", roles: ["Drums"], calendarProvider: "ICLOUD", paymentMethod: "VENMO" },
  { name: "Alexis Mather", initials: "AM", roles: ["Vocals"], calendarProvider: "GOOGLE", paymentMethod: "CASHAPP" },
  { name: "Javier Cruz", initials: "JC", roles: ["Keys"], calendarProvider: "GOOGLE", paymentMethod: "VENMO" },
  { name: "Marcus Hill", initials: "MH", roles: ["Trumpet"], calendarProvider: "ICLOUD", paymentMethod: "ZELLE" },
  { name: "Nora Kim", initials: "NK", roles: ["Vocals", "Violin"], calendarProvider: "GOOGLE", paymentMethod: "VENMO" },
  { name: "Ray Thompson", initials: "RT", roles: ["Guitar"], calendarProvider: "OUTLOOK", paymentMethod: "PAYPAL" },
];

async function main() {
  // Upsert the user so seeding is idempotent.
  const user = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "Patrick Lamb" },
  });
  console.log(`• user: ${user.email}`);

  // Wipe prior demo data for this user so a re-seed is clean.
  await db.gigPersonnel.deleteMany({ where: { gig: { ownerId: user.id } } });
  await db.activity.deleteMany({ where: { gig: { ownerId: user.id } } });
  await db.gig.deleteMany({ where: { ownerId: user.id } });
  await db.musician.deleteMany({ where: { ownerId: user.id } });
  await db.venue.deleteMany({ where: { ownerId: user.id } });

  // Roster
  const createdMusicians = await Promise.all(
    ROSTER.map((m) =>
      db.musician.create({
        data: {
          ownerId: user.id,
          name: m.name,
          email: m.email,
          initials: m.initials,
          roles: m.roles,
          isLeader: m.isLeader ?? false,
          calendarProvider: m.calendarProvider,
          paymentMethod: m.paymentMethod,
        },
      }),
    ),
  );
  console.log(`• musicians: ${createdMusicians.length}`);

  const find = (name: string) =>
    createdMusicians.find((m) => m.name === name)!;

  // Venues
  const funkyBiscuit = await db.venue.create({
    data: {
      ownerId: user.id,
      name: "The Funky Biscuit",
      addressL1: "303 SE Mizner Blvd",
      city: "Boca Raton",
      state: "FL",
      postalCode: "33432",
      phone: "(561) 465-3946",
      timezone: "America/New_York",
      notes: "Parking in back off Mizner. Load in through stage-right door. Green room has a fridge.",
    },
  });

  const [arturosJazz, privateBocaEvent, bonnetHouse] = await Promise.all([
    db.venue.create({
      data: {
        ownerId: user.id,
        name: "Arturo's Restaurant",
        addressL1: "6750 N Federal Hwy",
        city: "Boca Raton",
        state: "FL",
        postalCode: "33487",
        timezone: "America/New_York",
      },
    }),
    db.venue.create({
      data: {
        ownerId: user.id,
        name: "Private event · Boca",
        city: "Boca Raton",
        state: "FL",
        timezone: "America/New_York",
      },
    }),
    db.venue.create({
      data: {
        ownerId: user.id,
        name: "Bonnet House",
        addressL1: "900 N Birch Rd",
        city: "Fort Lauderdale",
        state: "FL",
        postalCode: "33304",
        timezone: "America/New_York",
      },
    }),
  ]);
  console.log(`• venues: 4`);

  // --- Gigs ---
  // The "Tonight" card should be the nearest upcoming Saturday from today.
  const now = new Date();
  const nextSaturday = new Date(now);
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
  nextSaturday.setDate(now.getDate() + daysUntilSat);

  const at = (d: Date, hour: number, minute = 0) => {
    const copy = new Date(d);
    copy.setHours(hour, minute, 0, 0);
    return copy;
  };

  // 1. Upcoming: The Funky Biscuit (the "Tonight" gig from the mockup)
  const funkyBiscuitGig = await db.gig.create({
    data: {
      ownerId: user.id,
      venueId: funkyBiscuit.id,
      status: "CONFIRMED",
      loadInAt: at(nextSaturday, 17, 30),
      soundcheckAt: at(nextSaturday, 18),
      callTimeAt: at(nextSaturday, 18),
      startAt: at(nextSaturday, 19, 30),
      clientPayCents: 120000,
      clientDepositCents: 60000,
      sound: "House FOH",
      lights: "House",
      attire: "Black on black",
      meal: "After check · green room",
      notes:
        "Audience skews 40+ — lean into blues-funk set. Soundcheck mic stands already up; just dial tones.",
      personnel: {
        create: [
          { musicianId: find("Patrick Lamb").id, payCents: 0, position: 0 },
          { musicianId: find("Dave Reinhardt").id, payCents: 35000, position: 1 },
          { musicianId: find("Tim George").id, payCents: 35000, position: 2 },
        ],
      },
    },
  });

  // 2. Further out: Arturo's — duo
  const arturosDate = new Date(nextSaturday);
  arturosDate.setDate(nextSaturday.getDate() + 7);
  await db.gig.create({
    data: {
      ownerId: user.id,
      venueId: arturosJazz.id,
      status: "CONFIRMED",
      startAt: at(arturosDate, 19),
      clientPayCents: 60000,
      attire: "Jacket, no tie",
      personnel: {
        create: [
          { musicianId: find("Patrick Lamb").id, payCents: 0, position: 0 },
          { musicianId: find("Javier Cruz").id, payCents: 25000, position: 1 },
        ],
      },
    },
  });

  // 3. Upcoming: private event (hold status)
  const privateDate = new Date(nextSaturday);
  privateDate.setDate(nextSaturday.getDate() + 14);
  await db.gig.create({
    data: {
      ownerId: user.id,
      venueId: privateBocaEvent.id,
      status: "HOLD",
      startAt: at(privateDate, 20),
      clientPayCents: 250000,
      attire: "Tux",
      notes: "Client is Montgomery wedding. Awaiting contract.",
      personnel: {
        create: [
          { musicianId: find("Patrick Lamb").id, payCents: 0, position: 0 },
          { musicianId: find("Dave Reinhardt").id, payCents: 50000, position: 1 },
          { musicianId: find("Tim George").id, payCents: 50000, position: 2 },
          { musicianId: find("Alexis Mather").id, payCents: 50000, position: 3 },
          { musicianId: find("Javier Cruz").id, payCents: 50000, position: 4 },
        ],
      },
    },
  });

  // 4. Past (Played): Bonnet House
  const pastDate = new Date(now);
  pastDate.setDate(now.getDate() - 10);
  const playedGig = await db.gig.create({
    data: {
      ownerId: user.id,
      venueId: bonnetHouse.id,
      status: "PLAYED",
      startAt: at(pastDate, 20),
      clientPayCents: 140000,
      personnel: {
        create: [
          { musicianId: find("Patrick Lamb").id, payCents: 0, position: 0 },
          { musicianId: find("Dave Reinhardt").id, payCents: 40000, position: 1, paidAt: new Date(), paidMethod: "ZELLE" },
          { musicianId: find("Nora Kim").id, payCents: 40000, position: 2 },
        ],
      },
    },
  });

  // Activity for the tonight gig (mirrors mockup)
  await db.activity.createMany({
    data: [
      {
        gigId: funkyBiscuitGig.id,
        action: "alert_sent",
        summary: "Gig alert sent to 3",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3),
      },
      {
        gigId: funkyBiscuitGig.id,
        action: "time_updated",
        summary: "Time updated · diff text sent",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 20),
      },
      {
        gigId: funkyBiscuitGig.id,
        action: "reminder_sent",
        summary: "Morning reminder sent",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 2),
      },
    ],
  });

  console.log(`• gigs: 4 (tonight: Funky Biscuit)`);
  console.log(`✓ seed complete`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

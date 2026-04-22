import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Cross-origin bulk-import endpoint for the Where's The Gig (WTG) migration.
// Accepts venues, musicians, and gigs arrays in a single POST, upserts
// everything, and links gig personnel to musicians by name. Protected by a
// shared secret passed as the x-import-secret header.
//
// CORS is enabled so the scraper JS running on wheresthegig.com can POST
// directly to this endpoint.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-import-secret, x-import-owner",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type VenueIn = { name: string; address?: string | null };
type MusicianIn = {
  name: string;
  email?: string | null;
  phone?: string | null;
  roles?: string[];
  notes?: string | null;
};
type GigIn = {
  // ISO date (YYYY-MM-DD) + optional HH:MM times
  date: string;
  startTime?: string | null;
  loadInTime?: string | null;
  soundcheckTime?: string | null;
  callTime?: string | null;
  endTime?: string | null;
  venueName?: string | null;
  status?: string | null;
  eventName?: string | null;
  clientName?: string | null;
  contactName?: string | null;
  notes?: string | null;
  sound?: string | null;
  meal?: string | null;
  attire?: string | null;
  gigType?: string | null;
  clientPayCents?: number | null;
  personnelNames?: string[];
};

export async function POST(req: Request) {
  const secret = req.headers.get("x-import-secret");
  if (!secret || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }

  const ownerEmail = (req.headers.get("x-import-owner") ?? "").trim();
  if (!ownerEmail) {
    return NextResponse.json({ error: "missing x-import-owner header" }, { status: 400, headers: CORS });
  }

  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail },
  });

  let body: { venues?: VenueIn[]; members?: MusicianIn[]; gigs?: GigIn[]; wipeFirst?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }

  const venues = body.venues ?? [];
  const members = body.members ?? [];
  const gigs = body.gigs ?? [];
  const wipeFirst = !!body.wipeFirst;

  const result = {
    wiped: 0,
    venuesCreated: 0,
    venuesUpdated: 0,
    membersCreated: 0,
    membersUpdated: 0,
    gigsCreated: 0,
    gigsSkipped: 0,
    gigsPersonnelLinked: 0,
    warnings: [] as string[],
  };

  if (wipeFirst) {
    const del = await db.$transaction([
      db.gigPersonnel.deleteMany({ where: { gig: { ownerId: owner.id } } }),
      db.gigExpense.deleteMany({ where: { gig: { ownerId: owner.id } } }),
      db.activity.deleteMany({ where: { gig: { ownerId: owner.id } } }),
      db.gig.deleteMany({ where: { ownerId: owner.id } }),
      db.musician.deleteMany({ where: { ownerId: owner.id } }),
      db.venue.deleteMany({ where: { ownerId: owner.id } }),
    ]);
    result.wiped = del.reduce((s, d) => s + d.count, 0);
  }

  // ── Venues ────────────────────────────────────────
  const venueByKey = new Map<string, string>(); // normalized name -> venue id
  for (const v of venues) {
    if (!v.name) continue;
    const parsed = parseAddress(v.address ?? "");
    const existing = await db.venue.findFirst({
      where: { ownerId: owner.id, name: v.name },
    });
    if (existing) {
      const updated = await db.venue.update({
        where: { id: existing.id },
        data: {
          addressL1: parsed.addressL1 ?? existing.addressL1,
          city: parsed.city ?? existing.city,
        },
      });
      venueByKey.set(v.name.toLowerCase().trim(), updated.id);
      result.venuesUpdated++;
    } else {
      const created = await db.venue.create({
        data: {
          ownerId: owner.id,
          name: v.name,
          addressL1: parsed.addressL1,
          city: parsed.city,
          country: "US",
        },
      });
      venueByKey.set(v.name.toLowerCase().trim(), created.id);
      result.venuesCreated++;
    }
  }

  // ── Members ───────────────────────────────────────
  const musicianByKey = new Map<string, string>(); // normalized name -> musician id
  for (const m of members) {
    if (!m.name) continue;
    const existing = await db.musician.findFirst({
      where: { ownerId: owner.id, name: m.name },
    });
    const data = {
      email: m.email ?? undefined,
      phone: m.phone ?? undefined,
      notes: m.notes ?? undefined,
      roles: m.roles ?? [],
      initials: deriveInitials(m.name),
    };
    if (existing) {
      const updated = await db.musician.update({
        where: { id: existing.id },
        data,
      });
      musicianByKey.set(m.name.toLowerCase().trim(), updated.id);
      result.membersUpdated++;
    } else {
      const created = await db.musician.create({
        data: {
          ownerId: owner.id,
          name: m.name,
          ...data,
          calendarProvider: "NONE",
        },
      });
      musicianByKey.set(m.name.toLowerCase().trim(), created.id);
      result.membersCreated++;
    }
  }

  // Pre-load existing musicians in case gigs reference members we haven't
  // imported yet (e.g., if this call includes gigs but not members).
  if (gigs.length > 0 && musicianByKey.size === 0) {
    const allMusicians = await db.musician.findMany({
      where: { ownerId: owner.id },
      select: { id: true, name: true },
    });
    for (const m of allMusicians) {
      musicianByKey.set(m.name.toLowerCase().trim(), m.id);
    }
  }
  if (gigs.length > 0 && venueByKey.size === 0) {
    const allVenues = await db.venue.findMany({
      where: { ownerId: owner.id },
      select: { id: true, name: true },
    });
    for (const v of allVenues) {
      venueByKey.set(v.name.toLowerCase().trim(), v.id);
    }
  }

  // ── Gigs ──────────────────────────────────────────
  for (const g of gigs) {
    if (!g.date) continue;

    const startAt = combine(g.date, g.startTime || "20:00");
    if (!startAt) {
      result.warnings.push(`skipped gig with bad date: ${g.date}`);
      result.gigsSkipped++;
      continue;
    }

    // Dedupe: same owner + same venue name + same startAt = already imported.
    const existingGig = await db.gig.findFirst({
      where: {
        ownerId: owner.id,
        startAt: { gte: startAt, lte: startAt },
      },
    });
    if (existingGig) {
      result.gigsSkipped++;
      continue;
    }

    const venueId = g.venueName
      ? venueByKey.get(g.venueName.toLowerCase().trim())
      : undefined;
    if (g.venueName && !venueId) {
      // Create a stub venue on the fly
      const stub = await db.venue.create({
        data: { ownerId: owner.id, name: g.venueName, country: "US" },
      });
      venueByKey.set(g.venueName.toLowerCase().trim(), stub.id);
    }

    const notes = [g.eventName, g.clientName, g.contactName, g.notes]
      .filter((s) => s && s !== "(no info)")
      .join(" · ") || null;

    const gig = await db.gig.create({
      data: {
        ownerId: owner.id,
        venueId: venueId ?? venueByKey.get((g.venueName ?? "").toLowerCase().trim()) ?? null,
        startAt,
        loadInAt: combine(g.date, g.loadInTime) ?? null,
        soundcheckAt: combine(g.date, g.soundcheckTime) ?? null,
        callTimeAt: combine(g.date, g.callTime) ?? null,
        endAt: combine(g.date, g.endTime) ?? null,
        status: mapStatus(g.status),
        sound: g.sound ?? null,
        meal: g.meal ?? null,
        attire: g.attire ?? null,
        notes,
        clientPayCents: g.clientPayCents ?? null,
      },
    });
    result.gigsCreated++;

    // Link personnel by name
    const names = g.personnelNames ?? [];
    for (let i = 0; i < names.length; i++) {
      const key = names[i]!.toLowerCase().trim();
      const mId = musicianByKey.get(key);
      if (!mId) continue;
      try {
        await db.gigPersonnel.create({
          data: {
            gigId: gig.id,
            musicianId: mId,
            payCents: 0,
            position: i,
          },
        });
        result.gigsPersonnelLinked++;
      } catch {
        // duplicate (@@unique), ignore
      }
    }
  }

  return NextResponse.json(result, { headers: CORS });
}

// ── helpers ──────────────────────────────────────────

function parseAddress(addr: string): { addressL1: string | null; city: string | null } {
  const trimmed = (addr ?? "").trim();
  if (!trimmed) return { addressL1: null, city: null };
  // WTG stores strings like "1120 Crestline Court, Lake Oswego" —
  // last comma-separated chunk is the city.
  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { addressL1: null, city: null };
  if (parts.length === 1) return { addressL1: parts[0]!, city: null };
  return {
    addressL1: parts.slice(0, -1).join(", ") || null,
    city: parts[parts.length - 1] ?? null,
  };
}

function deriveInitials(name: string): string {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  if (pieces.length === 0) return "•";
  if (pieces.length === 1) return pieces[0]!.slice(0, 2).toUpperCase();
  return (pieces[0]![0]! + pieces[pieces.length - 1]![0]!).toUpperCase();
}

function combine(date: string | null | undefined, time: string | null | undefined): Date | null {
  if (!date) return null;
  const t = (time ?? "").trim();
  if (!t) {
    // Return date at 00:00
    const parts = date.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  }
  // Accept "HH:MM" or "HH:MM AM/PM" or "h:mm AM"
  const h = parseTime(t);
  if (!h) return null;
  const d = date.split("-").map(Number);
  if (d.length !== 3 || d.some(Number.isNaN)) return null;
  return new Date(d[0]!, d[1]! - 1, d[2]!, h.hour, h.minute);
}

function parseTime(s: string): { hour: number; minute: number } | null {
  const str = s.toUpperCase().replace(/\s+/g, " ").trim();
  const m = str.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let hour = parseInt(m[1]!, 10);
  const minute = m[2] ? parseInt(m[2]!, 10) : 0;
  const ampm = m[3];
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function mapStatus(s: string | null | undefined): "INQUIRY" | "HOLD" | "CONFIRMED" | "PLAYED" | "CANCELLED" {
  const x = (s ?? "").toLowerCase();
  if (x.includes("cancel")) return "CANCELLED";
  if (x.includes("hold")) return "HOLD";
  if (x.includes("inquiry") || x.includes("tentative")) return "INQUIRY";
  if (x.includes("played") || x.includes("done") || x.includes("complete")) return "PLAYED";
  return "CONFIRMED";
}

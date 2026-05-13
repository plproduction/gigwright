import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// GET /api/search?q=foo → small unified typeahead for the AppNav search
// box. Returns up to 5 hits per kind (musicians, venues, gigs), filtered
// to the current user's data. Case-insensitive substring match on the
// fields a bandleader would naturally remember:
//   musician → name, email, phone
//   venue    → name, city
//   gig      → venue name, year, attire
// Anything more sophisticated (full-text, ranking, tour grouping) can
// be layered on later; for the size of a typical bandleader's roster +
// venue list + gig log, naïve substring search is well within budget.
export const dynamic = "force-dynamic";

type Hit =
  | {
      kind: "musician";
      id: string;
      title: string;
      sub: string | null;
      href: string;
    }
  | {
      kind: "venue";
      id: string;
      title: string;
      sub: string | null;
      href: string;
    }
  | {
      kind: "gig";
      id: string;
      title: string;
      sub: string | null;
      href: string;
    };

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const raw = url.searchParams.get("q")?.trim() ?? "";

  // Short queries return nothing. Two-character minimum keeps the
  // typeahead snappy and avoids returning the user's entire roster
  // on the first keystroke.
  if (raw.length < 2) {
    return NextResponse.json({ q: raw, hits: [] as Hit[] });
  }

  const q = raw;

  const [musicians, venues, gigs] = await Promise.all([
    db.musician.findMany({
      where: {
        ownerId: user.id,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
      take: 5,
      select: {
        id: true,
        name: true,
        roles: true,
        email: true,
        isLeader: true,
      },
    }),
    db.venue.findMany({
      where: {
        ownerId: user.id,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { state: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
      },
    }),
    db.gig.findMany({
      where: {
        ownerId: user.id,
        OR: [
          { venue: { name: { contains: q, mode: "insensitive" } } },
          { venue: { city: { contains: q, mode: "insensitive" } } },
          { attire: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { startAt: "desc" },
      take: 5,
      select: {
        id: true,
        startAt: true,
        attire: true,
        venue: { select: { name: true, city: true } },
      },
    }),
  ]);

  const hits: Hit[] = [
    ...musicians.map(
      (m): Hit => ({
        kind: "musician",
        id: m.id,
        title: m.name,
        sub:
          [m.isLeader ? "Leader" : null, m.roles.slice(0, 2).join(", ") || null]
            .filter(Boolean)
            .join(" · ") || null,
        href: `/roster/${m.id}/edit`,
      }),
    ),
    ...venues.map(
      (v): Hit => ({
        kind: "venue",
        id: v.id,
        title: v.name,
        sub: [v.city, v.state].filter(Boolean).join(", ") || null,
        href: `/venues/${v.id}/edit`,
      }),
    ),
    ...gigs.map((g): Hit => {
      const date = g.startAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return {
        kind: "gig",
        id: g.id,
        title: g.venue?.name ?? "Gig",
        sub: [date, g.venue?.city].filter(Boolean).join(" · "),
        href: `/gigs/${g.id}`,
      };
    }),
  ];

  return NextResponse.json({ q: raw, hits });
}

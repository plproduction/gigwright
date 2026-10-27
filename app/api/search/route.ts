import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// GET /api/search?q=foo → small unified typeahead for the AppNav search
// box. Returns up to 5 venues and gigs and up to MUSICIAN_LIMIT people,
// filtered to the current user's data. Case-insensitive substring match on the
// fields a bandleader would naturally remember:
//   musician → name, email, phone, roles (see ROLE_ALIASES)
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

// Roles are freeform ("Drums Miami", "Keybaords", "Piano / Engineer"),
// so a bandleader typing an instrument should get everyone who plays it
// regardless of how the tag was typed. Each group maps the words someone
// might search for to the substrings that identify that instrument.
const ROLE_ALIASES: { words: string[]; match: string[] }[] = [
  {
    words: ["key", "keys", "keyboard", "keyboards", "keybaords", "piano", "pianist"],
    match: ["key", "piano"],
  },
  { words: ["drum", "drums", "drummer", "drummers"], match: ["drum"] },
  { words: ["bass", "bassist", "bass player"], match: ["bass"] },
  { words: ["sax", "saxophone", "saxophonist"], match: ["sax"] },
  { words: ["guitar", "guitarist", "gtr"], match: ["guitar", "gutiar"] },
  {
    words: ["vocal", "vocals", "vocalist", "singer", "singers", "voice"],
    match: ["vocal", "singer"],
  },
  { words: ["perc", "percussion", "percussionist"], match: ["perc"] },
];

// Substrings a musician's role must contain to count as a hit for q.
// Known instrument words expand through ROLE_ALIASES; anything else
// matches as-is plus a crude stem ("trumpets" → "trumpet") so plurals
// and "-er"/"-ist" forms still find the tag.
function roleNeedles(q: string): string[] {
  const lower = q.toLowerCase();
  const alias = ROLE_ALIASES.find((a) => a.words.includes(lower));
  if (alias) return alias.match;
  const stem = lower.replace(/(ists?|ers?|s)$/, "");
  return stem.length >= 2 && stem !== lower ? [lower, stem] : [lower];
}

// Cap on People hits. High enough that "drums" returns the whole drum
// section of a big roster; the dropdown scrolls.
const MUSICIAN_LIMIT = 60;

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
    // Roles is a String[], which Prisma can't substring-match
    // case-insensitively, so pull the owner's roster and filter here.
    // A roster is a few hundred rows at most.
    db.musician.findMany({
      where: { ownerId: user.id },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        roles: true,
        email: true,
        phone: true,
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

  // Name/email/phone hits first, then people who matched on role only.
  const lowerQ = q.toLowerCase();
  const needles = roleNeedles(q);
  const byContact = musicians.filter(
    (m) =>
      m.name.toLowerCase().includes(lowerQ) ||
      (m.email?.toLowerCase().includes(lowerQ) ?? false) ||
      (m.phone?.includes(q) ?? false),
  );
  const byRole = musicians.filter(
    (m) =>
      !byContact.includes(m) &&
      // roles is NOT NULL in the schema but some older rows hold null.
      (m.roles ?? []).some((r) => {
        const role = r.toLowerCase();
        return needles.some((n) => role.includes(n));
      }),
  );
  const musicianHits = [...byContact, ...byRole].slice(0, MUSICIAN_LIMIT);

  const hits: Hit[] = [
    ...musicianHits.map(
      (m): Hit => ({
        kind: "musician",
        id: m.id,
        title: m.name,
        sub:
          [m.isLeader ? "Leader" : null, (m.roles ?? []).slice(0, 2).join(", ") || null]
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

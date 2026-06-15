import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildIcsFeed } from "@/lib/ical";

// GET /cal/[token]
// Live .ics feed of every gig the token's owner is involved in. Bandleader
// tokens return the owner's gigs (everything they're hosting). Musician
// tokens return every gig where any Musician row tied to this user is on
// the personnel — across every bandleader's roster, so a sideman playing
// with five bands sees one consolidated calendar.
//
// Token auth (no sign-in) is intentional: calendar apps can't run an
// OAuth flow. The token is 128 bits of entropy (see lib/ical.ts) so it's
// effectively unguessable, and the user can rotate it from their profile
// if a feed leaks. We never include pay info in the feed — even though
// the token is private, it's pasted into third-party apps where it could
// end up surfaced elsewhere.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const user = await db.user.findUnique({
    where: { icalToken: token },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return new NextResponse("Calendar not found", { status: 404 });
  }

  // Window: 60 days back + 365 days forward. Past gigs help the user
  // verify their calendar matches what actually happened; far-future
  // gigs aren't usually booked yet so we trim.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // Bandleader path: gigs the user owns.
  const ownedGigs = await db.gig.findMany({
    where: {
      ownerId: user.id,
      startAt: { gte: windowStart, lt: windowEnd },
      status: { not: "CANCELLED" },
    },
    include: { venue: true },
    orderBy: { startAt: "asc" },
  });

  // Sideman path: gigs where any Musician linked to this user is on the
  // personnel. Could overlap with ownedGigs (the leader plays their own
  // band) so we dedupe by gig id.
  const myMusicians = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicians.map((m) => m.id);
  const playingGigs =
    myIds.length === 0
      ? []
      : await db.gig.findMany({
          where: {
            personnel: { some: { musicianId: { in: myIds } } },
            startAt: { gte: windowStart, lt: windowEnd },
            status: { not: "CANCELLED" },
          },
          include: {
            venue: true,
            owner: { select: { name: true, email: true } },
          },
          orderBy: { startAt: "asc" },
        });

  const seen = new Set<string>();
  const gigs: Array<{
    id: string;
    startAt: Date;
    endAt: Date | null;
    eventName: string | null;
    notes: string | null;
    venue: { name: string; addressL1: string | null; addressL2: string | null; city: string | null; state: string | null; postalCode: string | null } | null;
    ownerLabel?: string;
  }> = [];
  for (const g of ownedGigs) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    gigs.push({ ...g, ownerLabel: undefined });
  }
  for (const g of playingGigs) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    gigs.push({
      ...g,
      ownerLabel:
        g.owner?.name ?? g.owner?.email?.split("@")[0] ?? undefined,
    });
  }

  const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";

  const ics = buildIcsFeed({
    calendarName: `GigWright — ${user.name ?? user.email ?? "Gigs"}`,
    description: "Your gigs from GigWright. Updates within ~1 hour of changes.",
    events: gigs.map((g) => {
      const venueName = g.venue?.name ?? "Venue TBD";
      const addressParts = [
        g.venue?.addressL1,
        g.venue?.addressL2,
        [g.venue?.city, g.venue?.state, g.venue?.postalCode]
          .filter(Boolean)
          .join(" "),
      ].filter((s): s is string => !!s && s.trim() !== "");
      const location = addressParts.length
        ? `${venueName}, ${addressParts.join(", ")}`
        : venueName;

      const summary = g.eventName ? `${g.eventName} — ${venueName}` : venueName;
      const descLines: string[] = [];
      if (g.ownerLabel) descLines.push(`Bandleader: ${g.ownerLabel}`);
      if (g.notes) descLines.push(g.notes);
      descLines.push(`Sheet: ${baseUrl}/g/${g.id}`);

      return {
        uid: `gig-${g.id}@gigwright.com`,
        startAt: g.startAt,
        endAt: g.endAt,
        summary,
        description: descLines.join("\n"),
        location,
        url: `${baseUrl}/g/${g.id}`,
      };
    }),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300", // 5 min CDN cache
    },
  });
}

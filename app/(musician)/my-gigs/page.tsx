import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import {
  formatDayNum,
  formatMonthAbbr,
  formatMoneyCents,
  formatTime,
  gigVenueLabel,
  isToday,
} from "@/lib/format";

export default async function MyGigsPage() {
  const user = await requireMusician();

  // All Musician rows linked to this user (could be across multiple
  // bandleaders' rosters, one email = one login).
  const myMusicians = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicians.map((m) => m.id);

  // Gigs the user is booked on. Include the bandleader's owner info so we
  // can show "Patrick Lamb Productions" for cross-bandleader context.
  const gigs = await db.gig.findMany({
    where: { personnel: { some: { musicianId: { in: myIds } } } },
    include: {
      venue: true,
      personnel: {
        include: { musician: true },
        orderBy: { position: "asc" },
      },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const now = new Date();
  const upcoming = gigs.filter((g) => g.startAt >= startOfDay(now));
  const past = gigs
    .filter((g) => g.startAt < startOfDay(now))
    .slice(0, 20);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          My gigs
        </h4>
        <div className="text-[11px] text-ink-mute">
          {upcoming.length} upcoming · {past.length > 0 ? `${past.length} recent` : ""}
        </div>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-line-strong bg-paper p-8 text-center">
          <div className="font-serif text-[18px]">No gigs yet.</div>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-soft">
            Once a bandleader books you on GigWright, it&rsquo;ll show up here.
            You&rsquo;ll also get texted and emailed on the channels you choose.
          </p>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-10">
          <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
            Upcoming
          </h5>
          <div className="grid grid-cols-1 gap-2">
            {upcoming.map((g) => (
              <GigRow key={g.id} gig={g} myIds={myIds} today={isToday(g.startAt)} />
            ))}
          </div>
        </div>
      )}

      {/* Past (recent 20) */}
      {past.length > 0 && (
        <div>
          <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
            Recent
          </h5>
          <div className="grid grid-cols-1 gap-2">
            {past.map((g) => (
              <GigRow key={g.id} gig={g} myIds={myIds} past />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

type GigRowData = Awaited<
  ReturnType<
    typeof db.gig.findMany<{
      include: {
        venue: true;
        personnel: { include: { musician: true } };
        owner: { select: { name: true; email: true } };
      };
    }>
  >
>[number];

function GigRow({
  gig,
  myIds,
  today,
  past,
}: {
  gig: GigRowData;
  myIds: string[];
  today?: boolean;
  past?: boolean;
}) {
  const venue = gigVenueLabel(gig.venue);
  const me = gig.personnel.find((p) => myIds.includes(p.musicianId));
  const bandleader =
    gig.owner?.name ?? gig.owner?.email?.split("@")[0] ?? "Bandleader";

  return (
    <Link
      href={`/my-gigs/${gig.id}`}
      className={`grid grid-cols-[70px_1.6fr_1fr_90px_100px_auto] items-center gap-4 rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:bg-paper-warm ${
        today ? "border-accent bg-paper-deep" : ""
      } ${past ? "opacity-80" : ""}`}
    >
      <div className="font-serif leading-none">
        <div className="text-[20px]">{formatDayNum(gig.startAt)}</div>
        <div className="mt-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
          {formatMonthAbbr(gig.startAt)}
        </div>
      </div>
      <div className="font-serif text-[16px] leading-tight">
        {venue.name}
        {venue.sub && (
          <div className="mt-0.5 font-sans text-[11px] text-ink-mute">
            {venue.sub}
          </div>
        )}
      </div>
      <div className="text-[12px] text-ink-soft">
        for <span className="text-ink">{bandleader}</span>
      </div>
      <div className="font-serif text-[13px] tabular-nums text-ink-soft">
        {formatTime(gig.callTimeAt ?? gig.startAt)}
      </div>
      <div className="font-serif text-[14px] tabular-nums">
        {me?.payCents ? formatMoneyCents(me.payCents) : "—"}
        {me?.paidAt && (
          <div className="mt-0.5 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-success">
            Paid
          </div>
        )}
      </div>
      <div className="text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
        Open →
      </div>
    </Link>
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

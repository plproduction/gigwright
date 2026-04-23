import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import {
  formatDayNum,
  formatMonthAbbr,
  formatMoneyCents,
} from "@/lib/format";

// Musician-facing earnings view: YTD pay per bandleader across every
// Musician row linked to this user, plus a year-picker and CSV download
// for tax prep. Only shows rows where paidAt is set (actual settled pay).
export default async function MyEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireMusician();
  const sp = await searchParams;
  const year = sp.year
    ? Number.parseInt(sp.year, 10)
    : new Date().getFullYear();
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

  const myMusicianRows = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicianRows.map((m) => m.id);

  const paid = await db.gigPersonnel.findMany({
    where: {
      musicianId: { in: myIds },
      paidAt: { not: null },
      gig: { startAt: { gte: start, lt: end } },
    },
    select: {
      id: true,
      payCents: true,
      paidAt: true,
      paidMethod: true,
      gig: {
        select: {
          id: true,
          startAt: true,
          venue: { select: { name: true } },
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  // Group by bandleader (owner)
  type Group = {
    bandleader: string;
    email: string | null;
    totalCents: number;
    gigCount: number;
  };
  const byLeader = new Map<string, Group>();
  for (const p of paid) {
    const key = p.gig.owner?.email ?? p.gig.owner?.name ?? "Unknown";
    const existing = byLeader.get(key);
    if (existing) {
      existing.totalCents += p.payCents;
      existing.gigCount += 1;
    } else {
      byLeader.set(key, {
        bandleader: p.gig.owner?.name ?? key.split("@")[0],
        email: p.gig.owner?.email ?? null,
        totalCents: p.payCents,
        gigCount: 1,
      });
    }
  }
  const leaderRows = [...byLeader.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );
  const totalCents = leaderRows.reduce((s, r) => s + r.totalCents, 0);
  const flaggedCount = leaderRows.filter((r) => r.totalCents >= 60000).length;

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          My earnings
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
            Tax year
          </span>
          <div className="flex gap-1 rounded-md border border-line bg-paper p-0.5">
            {years.map((y) => (
              <Link
                key={y}
                href={`/my-earnings?year=${y}`}
                prefetch={false}
                className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                  y === year
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-paper-warm"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Total earned"
          value={formatMoneyCents(totalCents)}
          sub={`paid out in ${year}`}
          emphasize
        />
        <Stat
          label="Bandleaders"
          value={String(leaderRows.length)}
          sub={`you worked for`}
        />
        <Stat
          label="1099 threshold met"
          value={`${flaggedCount} of ${leaderRows.length}`}
          sub={`bandleader(s) should issue you a 1099-NEC ($600+)`}
        />
      </section>

      <section className="mb-8 rounded-[10px] border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h5 className="font-serif text-[16px] font-normal">
            Totals by bandleader
          </h5>
          <a
            href={`/api/my/earnings?year=${year}`}
            className="rounded-md bg-ink px-3 py-1.5 text-[11.5px] font-semibold text-paper hover:bg-black"
          >
            Download CSV ({year})
          </a>
        </header>
        {leaderRows.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-ink-mute">
            No paid gigs recorded for {year}. Once a bandleader marks you paid
            on a gig, it&rsquo;ll show up here.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {leaderRows.map((r) => (
              <div
                key={r.bandleader}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3"
              >
                <div>
                  <div className="font-serif text-[15px] font-medium">
                    {r.bandleader}
                  </div>
                  {r.email && (
                    <div className="mt-0.5 text-[11px] text-ink-mute">
                      {r.email}
                    </div>
                  )}
                </div>
                <div className="text-[12px] text-ink-soft">
                  {r.gigCount} gig{r.gigCount === 1 ? "" : "s"}
                </div>
                <div className="text-right">
                  <div className="font-serif text-[15px] tabular-nums text-ink">
                    {formatMoneyCents(r.totalCents)}
                  </div>
                  {r.totalCents >= 60000 && (
                    <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                      1099 expected
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[10px] border border-line bg-surface">
        <header className="border-b border-line px-5 py-3">
          <h5 className="font-serif text-[16px] font-normal">
            Every paid gig in {year}
          </h5>
        </header>
        {paid.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-ink-mute">
            Nothing yet.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {paid.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[60px_1fr_auto_auto] items-center gap-4 px-5 py-2.5"
              >
                <div className="font-serif leading-none">
                  <div className="text-[18px]">{formatDayNum(p.gig.startAt)}</div>
                  <div className="mt-0.5 font-sans text-[9px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                    {formatMonthAbbr(p.gig.startAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[13.5px] font-medium">
                    {p.gig.venue?.name ?? "Venue TBD"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-mute">
                    for {p.gig.owner?.name ?? p.gig.owner?.email ?? "bandleader"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-ink-mute">
                  {p.paidMethod
                    ? p.paidMethod
                        .replace("_", " ")
                        .replace(/(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())
                    : "—"}
                </div>
                <div className="text-right font-serif text-[14px] tabular-nums">
                  {formatMoneyCents(p.payCents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div
        className={`mt-2 font-serif tabular-nums ${
          emphasize
            ? "text-[26px] font-light text-accent"
            : "text-[22px] font-light text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink-mute">{sub}</div>
    </div>
  );
}

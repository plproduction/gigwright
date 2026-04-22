import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMoneyCents } from "@/lib/format";

export default async function FinancePage() {
  const user = await requireUser();
  const gigs = await db.gig.findMany({
    where: { ownerId: user.id },
    include: {
      venue: true,
      personnel: { include: { musician: true } },
      expenses: true,
    },
    orderBy: { startAt: "desc" },
  });

  const now = new Date();
  const ytd = gigs.filter((g) => g.startAt.getFullYear() === now.getFullYear());
  const ytdPlayed = ytd.filter((g) => g.status === "PLAYED" || g.startAt < now);

  const ytdRevenue = ytdPlayed.reduce((s, g) => s + (g.clientPayCents ?? 0), 0);
  const ytdBandPayout = ytdPlayed.reduce(
    (s, g) =>
      s +
      g.personnel
        .filter((p) => !p.musician.isLeader)
        .reduce((s2, p) => s2 + p.payCents, 0),
    0,
  );
  const ytdExpenses = ytdPlayed.reduce(
    (s, g) => s + g.expenses.reduce((s2, e) => s2 + e.amountCents, 0),
    0,
  );
  const ytdNet = ytdRevenue - ytdBandPayout - ytdExpenses;

  // Gigs with unpaid band members
  const unpaidGigs = gigs
    .map((g) => ({
      gig: g,
      unpaid: g.personnel.filter(
        (p) => !p.musician.isLeader && !p.paidAt && (g.status === "PLAYED" || g.startAt < now),
      ),
    }))
    .filter((x) => x.unpaid.length > 0);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Finance
        </h4>
        <div className="flex items-center gap-5 text-[11px] text-ink-mute">
          <a
            href="https://www.gsa.gov/travel/plan-book/per-diem-rates"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line-strong underline-offset-4 hover:text-accent hover:decoration-accent"
          >
            GSA
          </a>
          <Link
            href="/settings"
            className="underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            Tax settings
          </Link>
        </div>
      </div>

      {/* YTD header */}
      <div className="mb-10 grid grid-cols-4 gap-3">
        <Stat label={`${now.getFullYear()} revenue`} value={formatMoneyCents(ytdRevenue)} />
        <Stat label="Band payout" value={formatMoneyCents(ytdBandPayout)} />
        <Stat label="Other expenses" value={formatMoneyCents(ytdExpenses)} />
        <Stat label="Your net" value={formatMoneyCents(ytdNet)} accent />
      </div>

      {/* Unpaid */}
      {unpaidGigs.length > 0 && (
        <div className="mb-10">
          <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
            Needs attention · {unpaidGigs.length} gig{unpaidGigs.length === 1 ? "" : "s"} with unpaid band
          </h5>
          <div className="rounded-[10px] border border-line">
            {unpaidGigs.map(({ gig, unpaid }) => {
              const owed = unpaid.reduce((s, p) => s + p.payCents, 0);
              return (
                <Link
                  key={gig.id}
                  href={`/gigs/${gig.id}`}
                  className="grid grid-cols-[2fr_2fr_1fr_auto] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0 hover:bg-paper-warm"
                >
                  <div>
                    <div className="font-serif text-[15px]">
                      {gig.venue?.name ?? "TBD"}
                    </div>
                    <div className="text-[11px] text-ink-mute">
                      {gig.startAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="text-[13px] text-ink-soft">
                    {unpaid.map((p) => p.musician.name.split(" ")[0]).join(", ")}
                  </div>
                  <div className="font-serif text-[15px] tabular-nums text-accent">
                    {formatMoneyCents(owed)}
                  </div>
                  <div className="text-[12px] text-accent">Open →</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-[12px] leading-[1.5] text-ink-mute">
        Each gig has its own payout worksheet &mdash; open a gig from the
        dashboard to edit income, band pay, expenses, and see net live.
        Mileage, meals &amp; entertainment, per-diem lookup, and QuickBooks
        sync land here next.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-paper p-[16px_18px]">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">
        {label}
      </div>
      <div
        className={`font-serif text-[26px] font-light leading-none tracking-tight tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

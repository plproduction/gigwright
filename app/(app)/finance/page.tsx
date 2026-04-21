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
    },
    orderBy: { startAt: "desc" },
  });

  const now = new Date();
  const ytdPlayed = gigs.filter(
    (g) => g.startAt.getFullYear() === now.getFullYear() && g.status === "PLAYED",
  );

  const ytdRevenue = ytdPlayed.reduce(
    (s, g) => s + (g.clientPayCents ?? 0),
    0,
  );
  const ytdBandPayout = ytdPlayed.reduce(
    (s, g) =>
      s +
      g.personnel
        .filter((p) => !p.musician.isLeader)
        .reduce((s2, p) => s2 + p.payCents, 0),
    0,
  );
  const ytdNet = ytdRevenue - ytdBandPayout;

  const unpaid = gigs.flatMap((g) =>
    g.personnel
      .filter(
        (p) =>
          !p.musician.isLeader &&
          !p.paidAt &&
          (g.status === "PLAYED" || g.startAt < now),
      )
      .map((p) => ({ gig: g, personnel: p })),
  );

  return (
    <>
      <h4 className="mb-5 border-b border-line pb-3 font-serif text-[20px] font-normal tracking-tight">
        Finance
      </h4>

      <div className="mb-8 grid grid-cols-3 gap-3">
        <FinanceStat label="YTD revenue" value={formatMoneyCents(ytdRevenue)} />
        <FinanceStat
          label="YTD band payout"
          value={formatMoneyCents(ytdBandPayout)}
        />
        <FinanceStat label="YTD your net" value={formatMoneyCents(ytdNet)} accent />
      </div>

      <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
        Unpaid band pay · {unpaid.length}
      </h5>
      {unpaid.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-ink-mute">
          Everyone&rsquo;s square.
        </div>
      ) : (
        <div className="text-[13px]">
          {unpaid.map(({ gig, personnel }) => (
            <div
              key={personnel.id}
              className="grid grid-cols-[2fr_2fr_auto_80px] items-center gap-3 border-b border-line py-3 pr-2"
            >
              <div className="font-serif text-[15px]">
                {gig.venue?.name ?? "TBD"}
                <div className="font-sans text-[11px] text-ink-mute">
                  {gig.startAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div className="font-serif text-[14px]">{personnel.musician.name}</div>
              <div className="font-serif text-[14px] tabular-nums">
                {formatMoneyCents(personnel.payCents)}
              </div>
              <div className="text-right text-[12px] text-accent">Mark paid →</div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-[12px] leading-[1.5] text-ink-mute">
        1099 export, expense tracking, mileage log, and deposit matching are
        coming.
      </p>
    </>
  );
}

function FinanceStat({
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
        className={`font-serif text-[28px] font-light leading-none tracking-tight tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

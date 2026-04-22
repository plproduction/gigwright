import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  formatDayNum,
  formatLongDate,
  formatMonthAbbr,
  formatMoneyCents,
  formatTime,
  gigVenueLabel,
  isToday,
  personnelSummary,
} from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();

  const gigs = await db.gig.findMany({
    where: { ownerId: user.id },
    orderBy: { startAt: "asc" },
    include: {
      venue: true,
      personnel: {
        include: { musician: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const now = new Date();
  const upcoming = gigs.filter((g) => g.startAt >= startOfDay(now));
  const tonight = upcoming.find((g) => isToday(g.startAt)) ?? upcoming[0];

  // Stats: simple derived values. Will become richer later.
  const thisMonth = gigs.filter(
    (g) =>
      g.startAt.getFullYear() === now.getFullYear() &&
      g.startAt.getMonth() === now.getMonth(),
  );
  const confirmedCount = thisMonth.filter((g) => g.status === "CONFIRMED").length;
  const holdCount = thisMonth.filter((g) => g.status === "HOLD").length;
  const inquiryCount = thisMonth.filter((g) => g.status === "INQUIRY").length;
  const ytdCount = gigs.filter(
    (g) =>
      g.startAt.getFullYear() === now.getFullYear() && g.status === "PLAYED",
  ).length;

  return (
    <>
      {/* Top row: Tonight card + Stats */}
      <div className="mb-7 grid grid-cols-[1.4fr_1fr] gap-[18px]">
        <TonightCard gig={tonight} />

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="This month"
            value={thisMonth.length}
            valueEm="gigs"
            note={
              thisMonth.length > 0
                ? `${confirmedCount} confirmed · ${holdCount} holds · ${inquiryCount} inquiries`
                : "No gigs this month yet"
            }
          />
          <Stat
            label="Holds to confirm"
            value={holdCount}
            valueEm="open"
            note={
              holdCount > 0
                ? "Follow up with clients for contracts"
                : "All clear"
            }
          />
          <Stat
            label="Year to date"
            value={ytdCount}
            valueEm="played"
            note={`Through ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          />
          <Stat
            label="Upcoming"
            value={upcoming.length}
            valueEm="booked"
            note={
              upcoming[0]
                ? `Next: ${upcoming[0].venue?.name ?? "TBD"}`
                : "Nothing on the books"
            }
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-1 flex items-center gap-[10px] border-b border-line pb-[10px] pt-[14px]">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">
          Gigs
        </h4>
        <span className="text-[12px] tracking-[0.06em] text-ink-mute">
          · {upcoming.length} upcoming
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="cursor-default rounded-full bg-ink px-[10px] py-[6px] text-[12px] font-medium text-paper">
            Upcoming
          </span>
          <Link
            href="/gigs/new"
            className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-[7px] text-[12px] font-medium text-paper hover:bg-black"
          >
            + New gig
          </Link>
        </div>
      </div>

      <GigList gigs={upcoming} />
    </>
  );
}

function TonightCard({
  gig,
}: {
  gig:
    | (Awaited<ReturnType<typeof getFakeType>>[number] & { _?: never })
    | undefined;
}) {
  if (!gig) {
    return (
      <div className="rounded-[10px] bg-ink p-6 text-paper">
        <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-[#D49B84]">
          <span className="mr-1.5 text-accent">●</span>
          Nothing on the books
        </div>
        <div className="font-serif text-[22px] font-light leading-tight">
          Add your next gig <em className="text-accent">here</em>.
        </div>
      </div>
    );
  }

  const venue = gigVenueLabel(gig.venue);
  const personnelCount = gig.personnel.length;
  const bandPay = gig.personnel
    .filter((p) => !p.musician.isLeader)
    .reduce((s, p) => s + p.payCents, 0);
  const today = isToday(gig.startAt);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 rounded-[10px] bg-ink p-[22px_24px] text-paper">
      <div>
        <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-[#D49B84]">
          <span className="mr-1.5 text-accent">●</span>
          {today ? "Tonight" : "Next up"} ·{" "}
          <span>{formatLongDate(gig.startAt)}</span>
        </div>
        <h3 className="font-serif text-[26px] font-light leading-[1.05] tracking-tight">
          {venue.name.split(" ").length > 1 ? (
            <>
              {venue.name.split(" ").slice(0, -1).join(" ")}{" "}
              <em className="font-light text-accent">
                {venue.name.split(" ").slice(-1)}
              </em>
            </>
          ) : (
            venue.name
          )}
        </h3>
        {venue.sub && (
          <div className="mb-4 mt-1.5 text-[12px] text-[#B5AFA2]">
            {venue.sub}
          </div>
        )}
        <div className="flex gap-7 border-t border-white/10 pt-3.5">
          <Meta label="Call" value={formatTime(gig.callTimeAt)} />
          <Meta label="Downbeat" value={formatTime(gig.startAt)} />
          <Meta label="On stage" value={String(personnelCount)} />
          <Meta label="Band pay" value={formatMoneyCents(bandPay)} />
        </div>
      </div>

      <div className="flex min-w-[170px] flex-col justify-between gap-1.5">
        <TonightButton href={`/gigs/${gig.id}`} primary>
          Open record
        </TonightButton>
        <TonightButton href="#" disabled>
          Send gig alert
        </TonightButton>
        <TonightButton href="#" disabled>
          Email gig sheet
        </TonightButton>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-[#8A8373]">
        {label}
      </div>
      <div className="font-serif text-[17px]">{value}</div>
    </div>
  );
}

function TonightButton({
  href,
  children,
  primary,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  const base =
    "flex items-center justify-between rounded-md border px-3 py-[9px] text-[12px] font-medium text-paper transition-colors";
  const variant = primary
    ? "border-accent bg-accent hover:bg-[#9B2D1E]"
    : "border-white/15 bg-white/[0.06] hover:bg-white/[0.12] hover:border-white/30";
  const dim = disabled ? "opacity-50 pointer-events-none" : "";
  return (
    <Link href={href} className={`${base} ${variant} ${dim}`}>
      <span>{children}</span>
      <span className="font-serif text-[15px] opacity-75">→</span>
    </Link>
  );
}

function Stat({
  label,
  value,
  valueEm,
  note,
}: {
  label: string;
  value: number | string;
  valueEm: string;
  note: string;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-paper p-[16px_18px]">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">
        {label}
      </div>
      <div className="font-serif text-[32px] font-light leading-none tracking-tight">
        {value} <em className="font-light text-accent">{valueEm}</em>
      </div>
      <div className="mt-1.5 text-[11px] text-ink-mute">{note}</div>
    </div>
  );
}

function GigList({
  gigs,
}: {
  gigs: Awaited<ReturnType<typeof getFakeType>>;
}) {
  if (gigs.length === 0) {
    return (
      <div className="py-16 text-center text-[13px] text-ink-mute">
        No upcoming gigs. <Link href="/gigs/new" className="text-accent underline-offset-4 hover:underline">Add one</Link>.
      </div>
    );
  }

  // Column layout:
  //   Date · Venue · Personnel · Load In · Sound Check · Downbeat · Pay · Status · Open
  const cols =
    "grid-cols-[70px_1.3fr_1.5fr_94px_140px_94px_94px_86px_64px]";

  return (
    <div className="text-[13px]">
      <div
        className={`grid ${cols} items-start gap-3 border-b border-line-strong px-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute`}
      >
        <div>Date</div>
        <div>Venue</div>
        <div>Personnel</div>
        <div>Load in</div>
        <div>
          Sound check
          <div className="mt-0.5 italic font-medium normal-case tracking-normal text-[10px] leading-[1.3] text-ink">
            (all lines run, instruments set up, ready to play at this time)
          </div>
        </div>
        <div>Downbeat</div>
        <div>Pay</div>
        <div>Status</div>
        <div></div>
      </div>
      {gigs.map((g) => {
        const venue = gigVenueLabel(g.venue);
        const today = isToday(g.startAt);
        const bandPay = g.personnel
          .filter((p) => !p.musician.isLeader)
          .reduce((s, p) => s + p.payCents, 0);
        const sideCount = g.personnel.filter((p) => !p.musician.isLeader).length;

        return (
          <div
            key={g.id}
            className={`grid ${cols} items-center gap-3 border-b border-line px-1.5 py-3.5 transition-colors hover:bg-paper-warm ${
              today ? "bg-paper-deep" : ""
            }`}
          >
            <div className="font-serif leading-none">
              <div className="text-[20px]">{formatDayNum(g.startAt)}</div>
              <div className="mt-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                {formatMonthAbbr(g.startAt)}
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
            <div className="text-[12px] leading-snug text-ink-soft">
              {personnelSummary(g.personnel.map((p) => p.musician.name), 4)}
            </div>
            <div className="font-serif text-[13px] tabular-nums text-ink-soft">
              {formatTime(g.loadInAt)}
            </div>
            <div className="font-serif text-[13px] tabular-nums text-ink-soft">
              {formatTime(g.soundcheckAt)}
            </div>
            <div className="font-serif text-[13px] tabular-nums text-ink">
              {formatTime(g.startAt)}
            </div>
            <div className="font-serif text-[13px] tabular-nums">
              {formatMoneyCents(bandPay)}
              {sideCount > 0 && (
                <div className="mt-0.5 font-sans text-[10px] text-ink-mute">
                  {sideCount} × band
                </div>
              )}
            </div>
            <div>
              <StatusPill status={today ? "TONIGHT" : g.status} />
            </div>
            <div className="flex justify-end">
              <Link
                href={`/gigs/${g.id}`}
                className="rounded-md border border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-paper-warm"
              >
                Open
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    TONIGHT: "bg-ink text-paper border-ink",
    CONFIRMED: "bg-ink text-paper border-ink",
    HOLD: "text-warn border-warn/30",
    INQUIRY: "text-ink-mute border-line-strong",
    PLAYED: "text-ink-soft border-line-strong opacity-70",
    CANCELLED: "text-accent border-accent/30 line-through",
  };
  const label = status === "TONIGHT" ? "Tonight" : titleCase(status);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${styles[status] ?? styles.CONFIRMED}`}
    >
      {label}
    </span>
  );
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Type helpers so our row/tonight components inherit the Prisma shape.
async function getFakeType() {
  return [] as Awaited<
    ReturnType<
      typeof db.gig.findMany<{
        include: {
          venue: true;
          personnel: { include: { musician: true } };
        };
      }>
    >
  >;
}

import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { FREE_LIMITS, isPaid } from "@/lib/plan";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { CalendarSubscribeCard } from "@/components/CalendarSubscribeCard";
import { ReferralBanner } from "@/components/ReferralBanner";
import { ensureMyIcalUrl } from "@/lib/actions/ical";
import { getReferralStatus } from "@/lib/actions/referrals";
import {
  formatDayNum,
  formatLongDate,
  formatMonthAbbr,
  formatTime,
  gigVenueLabel,
  isToday,
  personnelSummary,
} from "@/lib/format";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  // Two views: "upcoming" (default) and "past". Past gets sorted
  // newest-first so the gig the bandleader just played is at the top
  // — which is the whole reason you switch to past (pay people you
  // owe from last night's show).
  const view: "upcoming" | "past" = sp.view === "past" ? "past" : "upcoming";

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
  const past = gigs
    .filter((g) => g.startAt < startOfDay(now))
    .reverse(); // DESC by startAt (most recent first)
  const visible = view === "past" ? past : upcoming;
  const tonight = upcoming.find((g) => isToday(g.startAt)) ?? upcoming[0];

  // Stats. Three of these used to be wrong or useless:
  //
  //   "This month" counted the whole calendar month, so by the 22nd it
  //   was mostly gigs already behind you — and it bucketed with
  //   Date#getMonth(), which runs in the SERVER's timezone. Netlify runs
  //   UTC, so a 9pm Pacific show on the last of the month counted into
  //   the next one. Replaced with the next 30 days, which is a forward
  //   window and compares instants, so no timezone bucketing at all.
  //
  //   "Holds to confirm" counted HOLD only. An INQUIRY is equally
  //   unconfirmed and equally needs chasing, so a diary holding two
  //   unanswered inquiries reported "All clear." Counts both now.
  //
  //   "Year to date" counted status === PLAYED. Nothing in the app ever
  //   sets PLAYED — there's no "mark it played" step — so it read 1
  //   against a year with dozens of shows behind it. A gig in the past
  //   that wasn't cancelled is a gig you played; that's what it counts.
  const in30Days = new Date(startOfDay(now));
  in30Days.setDate(in30Days.getDate() + 30);
  const next30 = upcoming.filter((g) => g.startAt < in30Days);
  const next30Confirmed = next30.filter((g) => g.status === "CONFIRMED").length;

  const toConfirm = upcoming.filter(
    (g) => g.status === "HOLD" || g.status === "INQUIRY",
  );

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const playedThisYear = past.filter(
    (g) => g.startAt >= startOfYear && g.status !== "CANCELLED",
  ).length;

  // Brand-new account: nobody's added a gig yet. Show a welcoming onboarding
  // block with the 4 things a new bandleader should do first, rather than a
  // bunch of zero'd-out stat tiles.
  if (gigs.length === 0) {
    return <Onboarding firstName={(user.name ?? "").split(/\s+/)[0] || null} />;
  }

  // FREE active-gig cap state. "Active" mirrors lib/plan.ts —
  // anything not CANCELLED. The Upgrade banner is loud at-cap, quiet
  // near-cap, hidden otherwise.
  const activeGigCount = gigs.filter((g) => g.status !== "CANCELLED").length;
  const paid = isPaid(user.plan);
  const atGigCap = !paid && activeGigCount >= FREE_LIMITS.activeGigs;
  const nearGigCap = !paid && activeGigCount >= FREE_LIMITS.activeGigs - 1;

  // Referral status — surface the compact banner at the top of the
  // dashboard so bandleaders (and Patrick himself, who couldn't find
  // the referral card buried in /settings/billing) see it the moment
  // they open the app. Banner hides itself once the comp is active.
  const referral = await getReferralStatus();

  return (
    <>
      <ReferralBanner
        shareUrl={referral.shareUrl}
        paidCount={referral.paidCount}
        required={referral.required}
        compActive={referral.compActive}
      />

      {/* Top row: Tonight card + Stats. On mobile, Tonight goes full-width
          and the 4 stat tiles (admin-level overview data) are hidden —
          they're not useful on a gig-day phone view. */}
      <div className="mb-7 grid grid-cols-1 gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <TonightCard gig={tonight} />

        <div className="hidden grid-cols-2 gap-3 lg:grid">
          <Stat
            label="Next 30 days"
            value={next30.length}
            valueEm={next30.length === 1 ? "gig" : "gigs"}
            note={
              next30.length > 0
                ? `${next30Confirmed} confirmed · ${next30.length - next30Confirmed} to confirm`
                : "Nothing in the next month"
            }
          />
          <Stat
            label="To confirm"
            value={toConfirm.length}
            valueEm="open"
            href={toConfirm[0] ? `/gigs/${toConfirm[0].id}` : undefined}
            note={
              toConfirm[0]
                ? `Next: ${formatMonthAbbr(toConfirm[0].startAt)} ${formatDayNum(toConfirm[0].startAt)} · ${shorten(toConfirm[0].venue?.name ?? "TBD", 22)}`
                : "All confirmed"
            }
          />
          <Stat
            label="Played this year"
            value={playedThisYear}
            valueEm={playedThisYear === 1 ? "gig" : "gigs"}
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
      <div className="mb-1 flex flex-wrap items-center gap-[10px] border-b border-line pb-[10px] pt-[14px]">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">
          Gigs
        </h4>
        <span className="text-[12px] tracking-[0.06em] text-ink-mute">
          ·{" "}
          {view === "past"
            ? `${past.length} past`
            : `${upcoming.length} upcoming`}
          {!paid && ` · ${activeGigCount} / ${FREE_LIMITS.activeGigs} active`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CalendarSubscribeCard url={await ensureMyIcalUrl()} />
          {/* Upcoming ↔ Past toggle. Two pills, the active one filled,
              the inactive one outlined. URL-driven (?view=past) so the
              choice is bookmarkable and survives refresh. */}
          <Link
            href="/dashboard"
            className={
              view === "upcoming"
                ? "cursor-default rounded-full bg-ink px-[10px] py-[6px] text-[12px] font-medium text-paper"
                : "rounded-full border border-line-strong bg-transparent px-[10px] py-[6px] text-[12px] font-medium text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink"
            }
          >
            Upcoming
          </Link>
          <Link
            href="/dashboard?view=past"
            className={
              view === "past"
                ? "cursor-default rounded-full bg-ink px-[10px] py-[6px] text-[12px] font-medium text-paper"
                : "rounded-full border border-line-strong bg-transparent px-[10px] py-[6px] text-[12px] font-medium text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink"
            }
          >
            Past
          </Link>
          {atGigCap ? (
            <Link
              href="/settings/billing?upgrade=activeGigs"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-[7px] text-[12px] font-medium text-paper hover:bg-[#611B11]"
            >
              Upgrade to add more
            </Link>
          ) : (
            <div className="inline-flex items-center gap-2">
              <Link
                href="/gigs/new/from-contract"
                className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-[7px] text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                title="Upload a signed contract to auto-fill a new gig"
              >
                + From contract
              </Link>
              <Link
                href="/gigs/new"
                className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-[7px] text-[12px] font-medium text-paper hover:bg-black"
              >
                + New gig
              </Link>
            </div>
          )}
        </div>
      </div>

      {(atGigCap || nearGigCap) && (
        <div className="mt-3">
          <UpgradeBanner
            reason="activeGigs"
            message={
              atGigCap
                ? `You're at the Free plan limit of ${FREE_LIMITS.activeGigs} active gigs. Upgrade for unlimited.`
                : `${activeGigCount} of ${FREE_LIMITS.activeGigs} active gigs used on Free. Upgrade for unlimited.`
            }
          />
        </div>
      )}

      <GigList gigs={visible} view={view} />
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
  const today = isToday(gig.startAt);
  // "Friday, November 27" doesn't tell you how soon it is — you have to
  // work that out against today's date every time you look at the
  // dashboard. The whole point of this card is "what's next and how
  // close is it", so say it.
  const daysAway = Math.round(
    (startOfDay(gig.startAt).getTime() - startOfDay(new Date()).getTime()) /
      86_400_000,
  );
  const countdown =
    daysAway <= 0
      ? null
      : daysAway === 1
        ? "Tomorrow"
        : `In ${daysAway} days`;

  return (
    <div className="flex w-full flex-col gap-4 overflow-hidden rounded-[10px] bg-ink p-5 text-paper md:grid md:grid-cols-[1fr_auto] md:p-[22px_24px]">
      <div className="min-w-0">
        <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-[#D49B84]">
          <span className="mr-1.5 text-accent">●</span>
          {today ? "Tonight" : "Next up"} ·{" "}
          <span>{formatLongDate(gig.startAt)}</span>
          {countdown && (
            <span className="text-[#8A8373]"> · {countdown}</span>
          )}
          {gig.status !== "CONFIRMED" && (
            <span className="ml-2 rounded-full border border-white/25 px-1.5 py-px text-[9px] tracking-[0.14em]">
              {gig.status}
            </span>
          )}
        </div>
        <h3 className="font-serif text-[22px] font-light leading-[1.1] tracking-tight break-words md:text-[26px]">
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
        {/* Meta row: Call + Downbeat only on mobile. "On stage" surfaces
            on desktop as a quick glance. Pay info is intentionally absent
            from the dashboard so it never surfaces to a shoulder-surfer —
            it lives only on the per-gig Payout Worksheet (private
            financials). */}
        <div className="flex flex-wrap gap-5 border-t border-white/10 pt-3.5 md:gap-7">
          {/* A slot with nothing in it printed a bare "—", so the card's
              most prominent row led with a dash. If the call time isn't
              set, the slot simply isn't there. */}
          {gig.callTimeAt && (
            <Meta label="Call" value={formatTime(gig.callTimeAt)} />
          )}
          {gig.loadInAt && (
            <Meta label="Load in" value={formatTime(gig.loadInAt)} />
          )}
          <Meta label="Downbeat" value={formatTime(gig.startAt)} />
          {/* Headcount was desktop-only, which is backwards: the phone is
              what you have in your hand on the way to the gig. */}
          <Meta label="On stage" value={String(personnelCount)} />
        </div>
      </div>

      {/* Actions. "Send gig alert" and "Email gig sheet" used to sit here
          permanently greyed out, pointing at href="#", behind a comment
          saying they were waiting on the SMS fanout — which has been live
          for months. A disabled button teaches you to stop looking at
          that corner of the screen. Both are gone; sending an alert needs
          a message and a confirm step, so it belongs on the gig itself,
          where SendUpdateButton already does it properly.

          What's left is two real destinations: the record you edit, and
          the sheet the band sees. */}
      <div className="flex w-full flex-col gap-1.5 md:min-w-[170px]">
        <TonightButton href={`/gigs/${gig.id}`} primary>
          Open
        </TonightButton>
        <TonightButton href={`/g/${gig.id}`}>Gig sheet</TonightButton>
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

// No `disabled` variant on purpose. Every button on this card goes
// somewhere; if an action isn't ready, it doesn't get a button.
function TonightButton({
  href,
  children,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const base =
    "flex items-center justify-between rounded-md border px-3 py-[9px] text-[12px] font-medium text-paper transition-colors";
  const variant = primary
    ? "border-accent bg-accent hover:bg-[#9B2D1E]"
    : "border-white/15 bg-white/[0.06] hover:bg-white/[0.12] hover:border-white/30";
  return (
    <Link href={href} className={`${base} ${variant}`}>
      <span>{children}</span>
      <span className="font-serif text-[15px] opacity-75">→</span>
    </Link>
  );
}

// A number that tells you something needs doing should take you to the
// thing. `href` makes the whole tile the target; without one it stays a
// plain readout.
function Stat({
  label,
  value,
  valueEm,
  note,
  href,
}: {
  label: string;
  value: number | string;
  valueEm: string;
  note: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-mute">
        {label}
      </div>
      <div className="font-serif text-[32px] font-light leading-none tracking-tight">
        {value} <em className="font-light text-accent">{valueEm}</em>
      </div>
      {/* Fixed two-line well. Notes vary from "All confirmed" to
          "11 confirmed · 2 to confirm", and letting each tile size to its
          own note left the 2x2 grid with four different heights. */}
      <div className="mt-1.5 line-clamp-2 min-h-[30px] text-[11px] leading-[1.35] text-ink-mute">
        {note}
      </div>
    </>
  );

  const shell = "block rounded-[10px] border border-line bg-paper p-[16px_18px]";
  return href ? (
    <Link href={href} className={`${shell} transition-colors hover:border-line-strong hover:bg-paper-warm/50`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

function GigList({
  gigs,
  view,
}: {
  gigs: Awaited<ReturnType<typeof getFakeType>>;
  view: "upcoming" | "past";
}) {
  if (gigs.length === 0) {
    return (
      <div className="py-16 text-center text-[13px] text-ink-mute">
        {view === "past" ? (
          <>
            No past gigs yet.{" "}
            <Link
              href="/dashboard"
              className="text-accent underline-offset-4 hover:underline"
            >
              Back to upcoming
            </Link>
            .
          </>
        ) : (
          <>
            No upcoming gigs.{" "}
            <Link
              href="/gigs/new"
              className="text-accent underline-offset-4 hover:underline"
            >
              Add one
            </Link>
            .
          </>
        )}
      </div>
    );
  }

  // 9-column layout for desktop (lg+). Pay is intentionally absent —
  // per-gig pay belongs on the Payout Worksheet (private financials),
  // not in a public-facing list on the front-page dashboard.
  //   Date · Venue · Event · Personnel · Load In · Sound Check · Downbeat · Status · Open
  //
  // Event lives in its own column (right of venue, before personnel) so
  // a lineup of "Funky Biscuit · Funky Biscuit · Funky Biscuit" stops
  // reading like a stuck record — the event/leader name distinguishes
  // multiple gigs at the same room. Stays empty when not set.
  const cols =
    "grid-cols-[70px_1.1fr_1.0fr_1.3fr_94px_140px_94px_86px_64px]";

  return (
    <div className="text-[13px]">
      {/* Mobile card list (<lg): each gig renders as a self-contained card
          with just the glance-critical info. No horizontal overflow. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {gigs.map((g) => {
          const venue = gigVenueLabel(g.venue);
          const today = isToday(g.startAt);
          return (
            <Link
              key={g.id}
              href={`/gigs/${g.id}`}
              className={`flex items-center gap-3 rounded-[10px] border border-line bg-surface p-3 transition-colors hover:bg-paper-warm ${
                today ? "border-accent/50 bg-paper-deep" : ""
              }`}
            >
              <div className="w-[50px] shrink-0 text-center">
                <div className="font-serif text-[22px] leading-none">
                  {formatDayNum(g.startAt)}
                </div>
                <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute">
                  {formatMonthAbbr(g.startAt)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[16px] leading-tight">
                  {venue.name}
                </div>
                {g.eventName && (
                  <div className="mt-0.5 truncate font-serif text-[12px] italic text-accent">
                    {g.eventName}
                  </div>
                )}
                {venue.sub && (
                  <div className="mt-0.5 truncate text-[11px] text-ink-mute">
                    {venue.sub}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-soft">
                  <span className="font-serif tabular-nums">{formatTime(g.startAt)}</span>
                  <span className="text-ink-mute">·</span>
                  <span className="truncate">
                    {personnelSummary(g.personnel.map((p) => p.musician.name), 3)}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {view === "past" && g.status !== "CANCELLED" ? (
                  <PayPill personnel={g.personnel} />
                ) : (
                  <StatusPill status={today ? "TONIGHT" : g.status} />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop grid (lg+): the full 9-column table. */}
      <div className="hidden lg:block">
        <div
          className={`grid ${cols} items-start gap-3 border-b border-line-strong px-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute`}
        >
          <div>Date</div>
          <div>Venue</div>
          <div>Event</div>
          <div>Personnel</div>
          <div>Load in</div>
          <div>
            Sound check
            <div className="mt-0.5 font-medium normal-case tracking-normal text-[10px] leading-[1.3] text-ink">
              all lines run, instruments set up, ready to play at this time
            </div>
          </div>
          <div>Downbeat</div>
          <div>Status</div>
          <div></div>
        </div>
        {gigs.map((g) => {
          const venue = gigVenueLabel(g.venue);
          const today = isToday(g.startAt);

          return (
            <Link
              key={g.id}
              href={`/gigs/${g.id}`}
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
              {/* Event column — italic burgundy when set, em-dash when
                  empty so the column reads cleanly even without an
                  event name. */}
              <div className="font-serif text-[13.5px] italic leading-tight text-accent">
                {g.eventName || (
                  <span className="not-italic text-ink-mute/60">—</span>
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
              <div>
                {view === "past" && g.status !== "CANCELLED" ? (
                  <PayPill personnel={g.personnel} />
                ) : (
                  <StatusPill status={today ? "TONIGHT" : g.status} />
                )}
              </div>
              <div className="flex justify-end text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                Open →
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Past-view pill — replaces the status pill on gigs the bandleader has
// already played. Shows "X / Y paid" so unpaid gigs are scannable at a
// glance. Only counts sidemen (the leader pays themselves, so it would
// always read 0/N + 1 leader if we included them).
function PayPill({
  personnel,
}: {
  personnel: Awaited<ReturnType<typeof getFakeType>>[number]["personnel"];
}) {
  const sidemen = personnel.filter((p) => !p.musician.isLeader);
  const total = sidemen.length;
  const paid = sidemen.filter((p) => p.paidAt).length;

  if (total === 0) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
        Solo
      </span>
    );
  }

  const allPaid = paid === total;
  const style = allPaid
    ? "border-success/40 bg-success/10 text-success"
    : paid === 0
      ? "border-accent/40 bg-accent/5 text-accent"
      : "border-warn/40 bg-warn/5 text-warn";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums ${style}`}
      title={
        allPaid
          ? "Everyone paid"
          : `${total - paid} of ${total} still unpaid`
      }
    >
      {paid} / {total} paid
    </span>
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

// Venue names run long ("Sunset Cove Amphitheater", "Salem's Historic
// Grand Theatre") and a stat tile's note is one short line.
function shorten(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
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

// First-run onboarding card — shown when the user has zero gigs. Walks
// them through the 4 things a working bandleader does first so the app
// doesn't feel empty and uninviting.
function Onboarding({ firstName }: { firstName: string | null }) {
  const steps: Array<{
    n: string;
    title: string;
    body: string;
    href: string;
    cta: string;
  }> = [
    {
      n: "01",
      title: "Add your roster",
      body:
        "Drop in the musicians you hire — name, email, phone, and optional payment method. Once on the roster they're typeahead-available on every gig's payout worksheet.",
      href: "/roster/new",
      cta: "+ New musician",
    },
    {
      n: "02",
      title: "Add a venue or two",
      body:
        "Save the rooms you play regularly. Venue address + time zone carries over to every gig booked there, so you only type it once.",
      href: "/venues/new",
      cta: "+ New venue",
    },
    {
      n: "03",
      title: "Book your first gig",
      body:
        "Date, venue, call time, downbeat, personnel, pay. The worksheet lights up as you fill it in — every change shows up in the activity log and, once SMS goes live, fans out to the band.",
      href: "/gigs/new",
      cta: "+ New gig",
    },
    {
      n: "04",
      title: "Connect QuickBooks (optional)",
      body:
        "When a gig is fully paid, push the musician bills straight to QuickBooks Online as vendor bills. No re-keying at tax time.",
      href: "/settings/integrations",
      cta: "Connect QuickBooks",
    },
  ];
  return (
    <div className="mx-auto max-w-[880px] py-10">
      <div className="mb-8 text-center">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
          Welcome to GigWright
        </div>
        <h1 className="font-serif text-[40px] font-light leading-[1.05] tracking-tight">
          {firstName ? `Hey ${firstName}.` : "Welcome."}{" "}
          <span className="text-accent">Let&rsquo;s set up your spine.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[540px] text-[15px] leading-[1.55] text-ink-soft">
          A GigWright runs gigs — you need a roster, a venue, and a first gig to
          see what the app actually feels like. About five minutes to be up and
          running.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-[10px] border border-line bg-surface p-6"
          >
            <div className="flex items-start gap-3">
              <span className="font-serif text-[22px] font-light leading-none text-accent/80">
                {s.n}
              </span>
              <div>
                <h3 className="mb-1.5 font-serif text-[18px] font-normal tracking-tight">
                  {s.title}
                </h3>
                <p className="mb-4 text-[13px] leading-[1.55] text-ink-soft">
                  {s.body}
                </p>
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper transition-colors hover:bg-black"
                >
                  {s.cta}
                  <span className="font-serif text-[13px] font-light opacity-80">→</span>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-[10px] border border-dashed border-line-strong bg-paper-warm p-5 text-center">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
          Migrating from Where&rsquo;s The Gig?
        </div>
        <p className="mx-auto max-w-[540px] text-[13px] leading-[1.55] text-ink-soft">
          Use the one-click importer to pull in your venues, roster, and gig
          history. You&rsquo;ll be running on GigWright within an afternoon.
        </p>
        <Link
          href="/settings/import"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-line-strong bg-paper px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Start import
        </Link>
      </div>
    </div>
  );
}

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
import { MyMileageInput } from "@/components/MyMileageInput";
import { CalendarSubscribeCard } from "@/components/CalendarSubscribeCard";
import { ensureMyIcalUrl } from "@/lib/actions/ical";

export default async function MyGigsPage() {
  const user = await requireMusician();

  // All Musician rows linked to this user (could be across multiple
  // bandleaders' rosters, one email = one login). Pull paymentMethod
  // + payoutAddress + owner so we can show a prominent "set your payment
  // method" banner when none of these roster links has a method set —
  // the band reported "we can't find where to put payment credentials"
  // because nothing on this landing page pointed at /my-profile.
  const myMusicians = await db.musician.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      paymentMethod: true,
      payoutAddress: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const myIds = myMusicians.map((m) => m.id);

  // Show the banner when at least one of their roster links has no
  // payment method or address. We trigger on the *least* set-up link
  // so a musician who's set Venmo for one leader but not another still
  // gets nudged; it makes the most sense to fill it in once for all.
  const needsPaymentSetup = myMusicians.some(
    (m) => !m.paymentMethod || !m.payoutAddress,
  );
  const primaryLeaderName =
    myMusicians[0]?.owner?.name || myMusicians[0]?.owner?.email || "your bandleader";

  // Gigs the user is booked on. Include the bandleader's owner info so we
  // can show "Patrick Lamb Productions" for cross-bandleader context, plus
  // the user's existing mileage record per gig so the per-row mileage
  // input renders with the right initial value.
  const gigs = await db.gig.findMany({
    where: { personnel: { some: { musicianId: { in: myIds } } } },
    include: {
      venue: true,
      personnel: {
        include: { musician: true },
        orderBy: { position: "asc" },
      },
      owner: { select: { name: true, email: true } },
      musicianMileage: { where: { musicianId: { in: myIds } } },
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
      <div className="mb-6 flex items-baseline justify-between gap-3 border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          My gigs
        </h4>
        <div className="flex items-center gap-3">
          <CalendarSubscribeCard url={await ensureMyIcalUrl()} />
          <div className="text-[11px] text-ink-mute">
            {upcoming.length} upcoming · {past.length > 0 ? `${past.length} recent` : ""}
          </div>
        </div>
      </div>

      {/* Payment-method setup banner. The single most common question
          from a freshly-invited musician is "where do I tell my
          bandleader how to pay me?" The "My profile" nav link wasn't
          discoverable enough on its own — this banner spells out the
          action, names the bandleader for context, and disappears the
          moment they finish setup. */}
      {needsPaymentSetup && (
        <div className="mb-6 rounded-[10px] border border-accent/40 bg-accent/5 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                One quick thing
              </div>
              <h5 className="font-serif text-[17px] font-normal leading-tight text-ink">
                Tell {primaryLeaderName} how you want to be paid.
              </h5>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-soft">
                Pick a payment method (Venmo, PayPal, Cash App, Check, etc.)
                and your handle or address so payments don&rsquo;t get stuck
                waiting on a text on gig night. You only have to do this once.
              </p>
            </div>
            <Link
              href="/my-profile#payment"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-paper hover:bg-[#611B11]"
            >
              Set up payment →
            </Link>
          </div>
        </div>
      )}

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
        musicianMileage: true;
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
  // The user could be linked to more than one Musician row across
  // bandleaders, but for any given gig only ONE of those rows is on it
  // — that's the row we log mileage against.
  const myMusicianId = me?.musicianId ?? null;
  const myMileage = myMusicianId
    ? gig.musicianMileage.find((m) => m.musicianId === myMusicianId)?.miles ??
      null
    : null;

  return (
    <div
      className={`rounded-md border border-line bg-surface transition-colors hover:bg-paper-warm ${
        today ? "border-accent bg-paper-deep" : ""
      } ${past ? "opacity-80" : ""}`}
    >
      <Link
        href={`/my-gigs/${gig.id}`}
        className="grid grid-cols-[70px_1.6fr_1fr_90px_100px_auto] items-center gap-4 px-4 py-3"
      >
        <div className="font-serif leading-none">
          <div className="text-[20px]">{formatDayNum(gig.startAt)}</div>
          <div className="mt-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
            {formatMonthAbbr(gig.startAt)}
          </div>
        </div>
        <div className="font-serif text-[16px] leading-tight">
          {venue.name}
          {gig.eventName && (
            <div className="mt-0.5 font-serif text-[12.5px] italic text-accent">
              {gig.eventName}
            </div>
          )}
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
      {/* Mileage strip — lives OUTSIDE the Link so the number input
          doesn't navigate when the musician clicks to edit. Only
          rendered if the user has a musicianId on the gig. */}
      {myMusicianId && (
        <div className="border-t border-line/60 px-4 py-2">
          <MyMileageInput
            gigId={gig.id}
            musicianId={myMusicianId}
            initialMiles={myMileage}
          />
        </div>
      )}
    </div>
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

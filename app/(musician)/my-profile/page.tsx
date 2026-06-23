import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import { AvatarUpload } from "@/components/AvatarUpload";
import { pickerOptions } from "@/lib/payment-methods";
import {
  AutoSavingTextInput,
  AutoSavingSelect,
  AutoSavingCheckbox,
} from "@/components/AutoSavingProfileField";
import {
  formatDayNum,
  formatLongDate,
  formatMonthAbbr,
  gigVenueLabel,
} from "@/lib/format";

// Musician's self-serve profile page. Because a single musician email can
// be in multiple bandleaders' rosters (same person, different leaders), we
// aggregate linked Musician rows — edits apply to ALL of them so the
// musician has one source of truth regardless of who booked them.
export default async function MyProfilePage() {
  const user = await requireMusician();

  const mine = await db.musician.findMany({
    where: { userId: user.id },
    include: {
      owner: {
        select: {
          name: true,
          email: true,
          enabledPaymentMethods: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const primary = mine[0];
  if (!primary) {
    return (
      <div className="py-12 text-center text-[13px] text-ink-mute">
        No roster link yet.
      </div>
    );
  }
  const myIds = mine.map((m) => m.id);

  // Upcoming GigPersonnel rows the musician is on. We show only the
  // soonest 3 inline on /my-profile and collapse the rest behind a
  // "View all N gigs →" link to /my-gigs. Three was chosen as the
  // visual sweet-spot: enough for the page to feel populated, few
  // enough that scanning is instant. We query 4 (take: 4) so we can
  // detect "is there a 4th gig that means we should show the link"
  // without a second count() round-trip.
  const VISIBLE_GIGS = 3;
  const upcomingPersonnel = await db.gigPersonnel.findMany({
    where: {
      musicianId: { in: myIds },
      gig: {
        startAt: { gte: new Date() },
        status: { not: "CANCELLED" },
      },
    },
    include: {
      gig: {
        select: {
          id: true,
          startAt: true,
          eventName: true,
          guestListCap: true,
          venue: { select: { name: true, city: true, state: true } },
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { gig: { startAt: "asc" } },
    take: VISIBLE_GIGS + 1,
  });
  const visiblePersonnel = upcomingPersonnel.slice(0, VISIBLE_GIGS);
  const hasMore = upcomingPersonnel.length > VISIBLE_GIGS;
  // Total count (only fetched when overflow exists, to keep the page
  // cheap in the common case of ≤3 gigs).
  const totalUpcoming = hasMore
    ? await db.gigPersonnel.count({
        where: {
          musicianId: { in: myIds },
          gig: {
            startAt: { gte: new Date() },
            status: { not: "CANCELLED" },
          },
        },
      })
    : upcomingPersonnel.length;

  // Use the primary bandleader's enabled methods to drive the picker. If
  // a musician is on multiple leaders' rosters and they have different
  // preferences, the primary (most recently created roster link) wins —
  // the musician can always toggle methods that the primary leader
  // accepts and trust that any leader who DOESN'T accept it just won't
  // see that pay pill render their address.
  const methodOptions = pickerOptions(
    primary.owner?.enabledPaymentMethods ?? [],
  );

  const initials =
    primary.initials ??
    primary.name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          My profile
        </h4>
        <div className="text-[11px] text-ink-mute">
          Rostered by {mine.length} bandleader{mine.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Photo */}
      <div className="mb-6 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Photo
        </div>
        <AvatarUpload
          musicianId={primary.id}
          musicianName={primary.name}
          initialUrl={primary.avatarUrl}
          initials={initials}
        />
      </div>

      {/* Help line at the top of the form so musicians know they don't
          have to hunt for a Save button — every field saves itself the
          moment they tab/click away. Subtle, in muted ink. */}
      <p className="mb-4 max-w-[680px] text-[11.5px] italic text-ink-mute">
        Tip: changes save automatically as you tab out of each field — no
        Save button to hunt for.
      </p>

      <div className="grid max-w-[680px] grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Name">
          <input disabled value={primary.name} className="input opacity-70" />
        </Field>

        <Field label="Email">
          <AutoSavingTextInput
            field="email"
            type="email"
            defaultValue={primary.email ?? user.email ?? ""}
          />
        </Field>

        <Field label="Phone">
          <AutoSavingTextInput
            field="phone"
            type="tel"
            defaultValue={primary.phone ?? ""}
          />
        </Field>

        <Field label="Calendar provider" help="Where your gigs should appear automatically.">
          <AutoSavingSelect
            field="calendarProvider"
            defaultValue={primary.calendarProvider}
            options={[
              { value: "NONE", label: "None — SMS/email only" },
              { value: "ICLOUD", label: "iCloud (iPhone / Mac)" },
              { value: "GOOGLE", label: "Google Calendar" },
              { value: "OUTLOOK", label: "Outlook / Microsoft 365" },
            ]}
          />
        </Field>

        <div id="payment" className="col-span-2 scroll-mt-20" />
        <Field label="Payment method">
          <AutoSavingSelect
            field="paymentMethod"
            defaultValue={primary.paymentMethod ?? ""}
            options={[
              { value: "", label: "—" },
              ...methodOptions.map((m) => ({
                value: m.value,
                label: m.label,
                disabled: m.disabled,
              })),
            ]}
          />
        </Field>

        <Field span label="Payment address / handle" help="Venmo @handle · PayPal.me link · Cash App $cashtag">
          <AutoSavingTextInput
            field="payoutAddress"
            defaultValue={primary.payoutAddress ?? ""}
            placeholder="patrick@example.com / @patricklamb / $patrick"
          />
        </Field>

        <div className="col-span-2 flex flex-wrap gap-5 border-t border-line pt-4 text-[13px]">
          {/* SMS opt-in — TCR-compliant consent moment, auto-saves the
              moment the box flips. */}
          <AutoSavingCheckbox
            field="notifyBySms"
            defaultChecked={primary.notifyBySms}
            label="Yes, text me gig reminders and last-minute updates"
            sub="Msg & data rates may apply. Reply STOP anytime."
          />
          <AutoSavingCheckbox
            field="notifyByEmail"
            defaultChecked={primary.notifyByEmail}
            label="Email me about changes"
          />
          <AutoSavingCheckbox
            field="w9Received"
            defaultChecked={primary.w9Received}
            label="My W-9 is on file with my bandleader(s)"
          />
        </div>
      </div>

      {/* ── Your upcoming gigs ─────────────────────────────────────────
          Refined card list. The first 3 gigs render in full; anything
          beyond that collapses to a single "View all N gigs →" link to
          /my-gigs. Goal: a musician with two gigs sees a clean small
          page; a musician with twenty doesn't get a scroll-monster.
          Cards lean into the GigWright type system — Georgia serif
          venue, small all-caps date, accent-burgundy "→" on hover,
          tonight badge when the gig is today.
          ────────────────────────────────────────────────────────────── */}
      <div className="mt-10 border-t border-line pt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h5 className="font-serif text-[20px] font-normal tracking-tight">
            Your upcoming gigs
          </h5>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
            {totalUpcoming === 0
              ? "Nothing on the books"
              : totalUpcoming === 1
                ? "1 gig"
                : `${totalUpcoming} gigs`}
          </div>
        </div>
        <p className="mb-5 text-[12.5px] leading-snug text-ink-soft">
          Tap a gig to open its sheet — venue, times, lineup, and where
          your guest list goes for that night.
        </p>

        {totalUpcoming === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line-strong bg-paper-warm/40 p-8 text-center">
            <div className="font-serif text-[15px] italic text-ink-mute">
              You&rsquo;re not on any upcoming gigs yet.
            </div>
            <div className="mt-1 text-[12px] text-ink-mute">
              When your bandleader adds you, gigs land here automatically.
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {visiblePersonnel.map((p) => {
                const venue = gigVenueLabel(p.gig.venue);
                const leader =
                  p.gig.owner?.name ??
                  p.gig.owner?.email?.split("@")[0] ??
                  "Bandleader";
                const guestCount = (p.guestList ?? "")
                  .split("\n")
                  .filter((l) => l.trim() !== "").length;
                const today =
                  new Date(p.gig.startAt).toDateString() ===
                  new Date().toDateString();
                return (
                  <Link
                    key={p.id}
                    href={`/my-gigs/${p.gig.id}`}
                    className={`group grid grid-cols-[64px_1fr_auto] items-center gap-5 rounded-[10px] border bg-paper px-5 py-4 transition-all hover:border-accent/40 hover:shadow-sm ${
                      today
                        ? "border-accent bg-paper-deep/40"
                        : "border-line"
                    }`}
                  >
                    {/* Date strip — large serif day, all-caps month */}
                    <div className="text-center font-serif leading-none">
                      <div className="text-[26px] font-light tracking-tight text-ink">
                        {formatDayNum(p.gig.startAt)}
                      </div>
                      <div className="mt-1 font-sans text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
                        {formatMonthAbbr(p.gig.startAt)}
                      </div>
                    </div>

                    {/* Venue + event + leader */}
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[17px] font-normal leading-tight tracking-tight text-ink">
                        {venue.name}
                      </div>
                      {p.gig.eventName && (
                        <div className="mt-0.5 truncate font-serif text-[12.5px] italic leading-tight text-accent">
                          {p.gig.eventName}
                        </div>
                      )}
                      <div className="mt-1.5 text-[11px] leading-tight text-ink-mute">
                        {formatLongDate(p.gig.startAt)}{" "}
                        <span className="text-ink-mute/60">·</span> for{" "}
                        <span className="text-ink-soft">{leader}</span>
                      </div>
                    </div>

                    {/* Right-side state + chevron */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right text-[10px] font-semibold uppercase tracking-[0.14em]">
                        {today && (
                          <div className="mb-1 text-accent">Tonight</div>
                        )}
                        {guestCount === 0 ? (
                          <span className="text-ink-mute">+ Guest list</span>
                        ) : (
                          <span className="text-success">
                            ● {guestCount}{" "}
                            {guestCount === 1 ? "guest" : "guests"}
                          </span>
                        )}
                      </div>
                      <div className="font-serif text-[18px] text-ink-mute transition-colors group-hover:text-accent">
                        →
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-4 text-center">
                <Link
                  href="/my-gigs"
                  className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent hover:underline underline-offset-4 decoration-accent/40"
                >
                  View all {totalUpcoming} gigs
                  <span className="font-serif text-[14px] font-light">→</span>
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Show who has me in their roster */}
      {mine.length > 1 && (
        <div className="mt-10">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
            You&rsquo;re on {mine.length} rosters
          </div>
          <ul className="space-y-1.5 text-[13px] text-ink-soft">
            {mine.map((m) => (
              <li key={m.id}>
                {m.owner?.name ?? m.owner?.email ?? "Bandleader"}
                {" · "}
                {m.roles.join(", ") || "—"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
  span,
  help,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
  help?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${span ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      {children}
      {help && <span className="text-[11px] text-ink-soft">{help}</span>}
    </label>
  );
}


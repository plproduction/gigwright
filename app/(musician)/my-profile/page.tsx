import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import { AvatarUpload } from "@/components/AvatarUpload";
import { pickerOptions } from "@/lib/payment-methods";
import { saveMyProfile } from "@/lib/actions/my-profile";
import { MyGuestListInput } from "@/components/MyGuestListInput";
import { formatLongDate, gigVenueLabel } from "@/lib/format";

// Musician's self-serve profile page. Because a single musician email can
// be in multiple bandleaders' rosters (same person, different leaders), we
// aggregate linked Musician rows — edits apply to ALL of them so the
// musician has one source of truth regardless of who booked them.
export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireMusician();
  const sp = await searchParams;
  const justSaved = sp.saved === "1";

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

  // Upcoming GigPersonnel rows the musician is on — used to render the
  // per-gig guest list section on this same page, so they don't have
  // to navigate to /my-gigs/[id] just to fill in names. Pulls the
  // existing guestList value so the textarea renders pre-populated.
  // Capped to next 10 upcoming gigs to keep the page reasonable; if
  // a musician has more they can still use /my-gigs/[id] for the rest.
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
          venue: { select: { name: true, city: true, state: true } },
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { gig: { startAt: "asc" } },
    take: 10,
  });

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

      {justSaved && (
        <div className="mb-5 max-w-[680px] rounded-md border border-success/40 bg-success/10 px-4 py-2.5 text-[13px] text-success">
          ✓ Saved — your bandleader(s) will see your updated info next time
          they open a gig sheet.
        </div>
      )}

      <form action={saveMyProfile} className="grid max-w-[680px] grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Name">
          <input disabled value={primary.name} className="input opacity-70" />
        </Field>

        <Field label="Email">
          <input
            name="email"
            type="email"
            defaultValue={primary.email ?? user.email}
            className="input"
          />
        </Field>

        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={primary.phone ?? ""} className="input" />
        </Field>

        <Field label="Calendar provider" help="Where your gigs should appear automatically.">
          <select
            name="calendarProvider"
            defaultValue={primary.calendarProvider}
            className="input"
          >
            <option value="NONE">None — SMS/email only</option>
            <option value="ICLOUD">iCloud (iPhone / Mac)</option>
            <option value="GOOGLE">Google Calendar</option>
            <option value="OUTLOOK">Outlook / Microsoft 365</option>
          </select>
        </Field>

        <div id="payment" className="col-span-2 scroll-mt-20" />
        <Field label="Payment method">
          <select
            name="paymentMethod"
            defaultValue={primary.paymentMethod ?? ""}
            className="input"
          >
            <option value="">—</option>
            {methodOptions.map((m) => (
              <option key={m.value} value={m.value} disabled={m.disabled}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field span label="Payment address / handle" help="Venmo @handle · PayPal.me link · Cash App $cashtag">
          <input
            name="payoutAddress"
            defaultValue={primary.payoutAddress ?? ""}
            placeholder="patrick@example.com / @patricklamb / $patrick"
            className="input"
          />
        </Field>

        <div className="col-span-2 flex flex-wrap gap-5 border-t border-line pt-4 text-[13px]">
          {/* This is the cleanest, TCR-compliant opt-in moment — the
              musician themselves toggling whether they want SMS, on a
              page they personally logged into. The label is plain
              English consent language so checking it is a real
              affirmative act, not a buried setting. */}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="notifyBySms"
              defaultChecked={primary.notifyBySms}
              className="mt-[3px]"
            />
            <span className="leading-snug">
              Yes, text me gig reminders and last-minute updates
              <span className="ml-1 block text-[11px] font-normal text-ink-mute">
                Msg &amp; data rates may apply. Reply STOP anytime.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="notifyByEmail"
              defaultChecked={primary.notifyByEmail}
            />
            <span>Email me about changes</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="w9Received"
              defaultChecked={primary.w9Received}
            />
            <span>My W-9 is on file with my bandleader(s)</span>
          </label>
        </div>

        <div className="col-span-2 pt-5">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
          >
            Save
          </button>
        </div>
      </form>

      {/* Per-gig guest list — lives on /my-profile (not just inside each
          gig's page) because the bandleader's invite email lands the
          musician here. Asking them to log in, then navigate to a
          specific gig, then scroll, is too many steps for the most
          common ask ("who's on your list for this gig?"). One textarea
          per upcoming gig; reuses the same MyGuestListInput component
          that lives on /my-gigs/[id], so the data is consistent
          wherever the musician chooses to edit. */}
      {upcomingPersonnel.length > 0 && (
        <div className="mt-10 border-t border-line pt-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h5 className="font-serif text-[18px] font-normal tracking-tight">
              Your guest list — by gig
            </h5>
            <div className="text-[11px] text-ink-mute">
              {upcomingPersonnel.length === 1
                ? "1 upcoming gig"
                : `${upcomingPersonnel.length} upcoming gigs`}
            </div>
          </div>
          <p className="mb-4 text-[12.5px] leading-snug text-ink-soft">
            One list per gig. The bandleader sees a consolidated list of
            everyone&rsquo;s guests on their gig page and approves them
            one by one for the venue.
          </p>
          <div className="flex flex-col gap-4">
            {upcomingPersonnel.map((p) => {
              const venue = gigVenueLabel(p.gig.venue);
              const leader =
                p.gig.owner?.name ??
                p.gig.owner?.email?.split("@")[0] ??
                "Bandleader";
              return (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <div>
                      <Link
                        href={`/my-gigs/${p.gig.id}`}
                        className="font-serif text-[14px] font-medium leading-tight hover:text-accent"
                      >
                        {venue.name}
                      </Link>
                      {p.gig.eventName && (
                        <span className="ml-2 font-serif text-[12px] italic text-accent">
                          {p.gig.eventName}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-mute">
                      {formatLongDate(p.gig.startAt)} · for {leader}
                    </div>
                  </div>
                  <MyGuestListInput
                    gigId={p.gig.id}
                    musicianId={p.musicianId}
                    initialValue={p.guestList}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

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


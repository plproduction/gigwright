import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LatestUpdateBanner } from "@/components/LatestUpdateBanner";
import {
  formatDayNum,
  formatLongDate,
  formatTime,
  formatYear,
  mapLink,
} from "@/lib/format";

type Params = { id: string };

// Public, read-only gig view intended for SMS/email click-throughs.
// Musicians (and anyone else with the link) see the operational details
// for the gig — but NEVER pay, reconciliation, expenses, or the roster.
//
// Permission design:
// - No auth required; the gig id (a cuid) is the capability.
// - We scope the query to only return fields that are safe for public
//   viewing, and render first names only for personnel.
// - If the gig doesn't exist, 404.

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const gig = await db.gig.findUnique({
    where: { id },
    select: {
      venue: { select: { name: true } },
      startAt: true,
    },
  });
  if (!gig) return { title: "Gig not found" };
  const name = gig.venue?.name ?? "Gig";
  return {
    title: `${name} · ${formatLongDate(gig.startAt)}`,
    description: `Gig details for ${name} on ${formatLongDate(gig.startAt)}.`,
    robots: { index: false, follow: false }, // keep public gigs out of search
  };
}

export default async function PublicGigPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  // Fetch only fields safe to expose publicly.
  const gig = await db.gig.findUnique({
    where: { id },
    select: {
      id: true,
      startAt: true,
      loadInAt: true,
      soundcheckAt: true,
      callTimeAt: true,
      endAt: true,
      secondStartAt: true,
      secondEndAt: true,
      status: true,
      eventName: true,
      sound: true,
      soundContactName: true,
      soundContactPhone: true,
      lights: true,
      attire: true,
      meal: true,
      notes: true,
      lastUpdateLabel: true,
      lastUpdateMessage: true,
      lastUpdateAt: true,
      materialsUrl: true,
      setlistUrl: true,
      setlistFileName: true,
      stagePlotUrl: true,
      stagePlotFileName: true,
      loadingInfo: true,
      loadingMapUrl: true,
      loadingMapLink: true,
      venue: {
        select: {
          name: true,
          addressL1: true,
          addressL2: true,
          city: true,
          state: true,
          postalCode: true,
          phone: true,
          timezone: true,
          notes: true,
        },
      },
      personnel: {
        select: {
          musician: { select: { name: true, roles: true, phone: true } },
          position: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!gig) notFound();

  const venueMap = gig.venue ? mapLink(gig.venue) : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-6 py-4">
          <Link href="/" className="font-serif text-[22px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">Wright</em>
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
            Gig sheet
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-10">
        <LatestUpdateBanner
          label={gig.lastUpdateLabel}
          message={gig.lastUpdateMessage}
          at={gig.lastUpdateAt}
        />
        {/* Hero block */}
        <section className="mb-10">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            {gig.status}
          </div>
          <h1 className="mb-2 font-serif text-[40px] font-light leading-[1.1] tracking-tight">
            {gig.venue?.name ?? "Gig"}
          </h1>
          {gig.eventName && (
            <div className="mb-2 font-serif text-[20px] italic leading-tight text-accent">
              {gig.eventName}
            </div>
          )}
          <div className="text-[16px] text-ink-soft">
            {formatLongDate(gig.startAt)}, {formatYear(gig.startAt)}
          </div>
        </section>

        {/* Time grid */}
        <section className="mb-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
          <TimeTile label="Call" time={gig.callTimeAt} />
          <TimeTile label="Load in" time={gig.loadInAt} />
          <TimeTile label="Sound check" time={gig.soundcheckAt} />
          <TimeTile
            label={gig.secondStartAt ? "1st downbeat" : "Downbeat"}
            time={gig.startAt}
            emphasize
          />
          <TimeTile
            label={gig.secondStartAt ? "1st finish" : "Finish"}
            time={gig.endAt}
          />
          {gig.secondStartAt && (
            <TimeTile label="2nd downbeat" time={gig.secondStartAt} emphasize />
          )}
          {gig.secondEndAt && (
            <TimeTile label="2nd finish" time={gig.secondEndAt} />
          )}
        </section>

        {/* Venue + map */}
        {gig.venue && (
          <Section title="Venue">
            <div className="text-[15px] font-medium">{gig.venue.name}</div>
            {(gig.venue.addressL1 || gig.venue.city) && (
              <div className="mt-0.5 whitespace-pre-line text-[13px] leading-[1.55] text-ink-soft">
                {[
                  gig.venue.addressL1,
                  gig.venue.addressL2,
                  [gig.venue.city, gig.venue.state].filter(Boolean).join(", "),
                  gig.venue.postalCode,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </div>
            )}
            {venueMap && (
              <a
                href={venueMap}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[12px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
              >
                Open in Maps ↗
              </a>
            )}
            {gig.venue.phone && (
              <div className="mt-2 text-[12px] text-ink-soft">
                Venue phone: <a href={`tel:${gig.venue.phone}`} className="text-accent hover:underline">{gig.venue.phone}</a>
              </div>
            )}
          </Section>
        )}

        {/* Personnel — first names + roles + phone (tappable). The
            phone is here so band members can text/call each other when
            they need to coordinate (running late, parking, etc.). The
            gig URL is a capability token (long cuid) so this stays
            band-only as long as the bandleader doesn't broadly share
            the link. */}
        {gig.personnel.length > 0 && (
          <Section title="Band">
            <ul className="flex flex-col divide-y divide-line">
              {gig.personnel.map((p, i) => {
                const tel = p.musician.phone
                  ? p.musician.phone.replace(/[^0-9+]/g, "")
                  : null;
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <em className="font-serif text-[15px] not-italic text-ink">
                        {p.musician.name.split(/\s+/)[0]}
                      </em>
                      {p.musician.roles.length > 0 && (
                        <span className="text-[12px] text-ink-mute">
                          {p.musician.roles.join(" · ")}
                        </span>
                      )}
                    </div>
                    {tel ? (
                      <a
                        href={`tel:${tel}`}
                        className="text-[13px] font-medium text-accent decoration-accent/40 underline-offset-4 hover:underline"
                      >
                        {p.musician.phone}
                      </a>
                    ) : (
                      <span className="text-[12px] text-ink-mute">
                        no phone
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* Loading info */}
        {(gig.loadingInfo || gig.loadingMapUrl || gig.loadingMapLink) && (
          <Section title="Loading info">
            {gig.loadingInfo && (
              <div className="mb-3 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink-soft">
                {gig.loadingInfo}
              </div>
            )}
            {gig.loadingMapUrl && (
              <a
                href={gig.loadingMapUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-3 block overflow-hidden rounded-md border border-line bg-paper-warm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gig.loadingMapUrl}
                  alt="Loading map"
                  className="h-auto w-full max-h-[320px] object-contain"
                />
              </a>
            )}
            {gig.loadingMapLink && (
              <a
                href={gig.loadingMapLink}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
              >
                Alternate map ↗
              </a>
            )}
          </Section>
        )}

        {/* Tech + attire */}
        {(gig.sound || gig.soundContactName || gig.soundContactPhone || gig.lights || gig.attire || gig.meal) && (
          <Section title="Tech &amp; attire">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13px] text-ink-soft">
              {gig.sound && <Row label="Sound" value={gig.sound} />}
              {gig.soundContactName && <Row label="Sound lead" value={gig.soundContactName} />}
              {gig.soundContactPhone && (
                <Row
                  label="Sound phone"
                  value={
                    <a href={`tel:${gig.soundContactPhone}`} className="text-accent hover:underline">
                      {gig.soundContactPhone}
                    </a>
                  }
                />
              )}
              {gig.lights && <Row label="Lights" value={gig.lights} />}
              {gig.attire && <Row label="Attire" value={gig.attire} />}
              {gig.meal && <Row label="Meal" value={gig.meal} />}
            </dl>
          </Section>
        )}

        {/* Set list + stage plot + materials — all "click to open a file"
            references. Stage plot slots between set list and materials so
            tech (stage layout) sits with music (set list) and reference
            files (charts/materials) — the natural reading order before
            walking on stage. */}
        {(gig.setlistUrl || gig.stagePlotUrl || gig.materialsUrl) && (
          <Section title="Music">
            <ul className="flex flex-col gap-2 text-[14px]">
              {gig.setlistUrl && (
                <li>
                  <a
                    href={gig.setlistUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                  >
                    📄 {gig.setlistFileName ?? "Set list"}
                  </a>
                </li>
              )}
              {gig.stagePlotUrl && (
                <li>
                  <a
                    href={gig.stagePlotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                  >
                    🎚️ {gig.stagePlotFileName ?? "Stage plot"}
                  </a>
                </li>
              )}
              {gig.materialsUrl && (
                <li>
                  <a
                    href={gig.materialsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                  >
                    Charts &amp; materials ↗
                  </a>
                </li>
              )}
            </ul>
          </Section>
        )}

        {/* Notes */}
        {gig.notes && (
          <Section title="Notes">
            <div className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink-soft">
              {gig.notes}
            </div>
          </Section>
        )}

        {/* Footer tag */}
        <div className="mt-12 border-t border-line pt-6 text-center text-[11px] text-ink-mute">
          Sent via <Link href="/" className="hover:text-ink">GigWright</Link> ·
          {" "}This page is read-only.
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}

function TimeTile({
  label,
  time,
  emphasize,
}: {
  label: string;
  time: Date | null;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div
        className={`mt-1 ${
          emphasize
            ? "font-serif text-[24px] font-normal tracking-tight text-accent"
            : "font-serif text-[20px] font-normal tracking-tight text-ink"
        }`}
      >
        {formatTime(time) !== "—" ? formatTime(time) : "—"}
      </div>
    </div>
  );
}

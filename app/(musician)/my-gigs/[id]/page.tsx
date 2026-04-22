import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import {
  formatDayNum,
  formatLongDate,
  formatMoneyCents,
  formatTime,
  formatYear,
  mapLink,
} from "@/lib/format";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const gig = await db.gig.findUnique({
    where: { id },
    include: { venue: true },
  });
  const name = gig?.venue?.name ?? "Gig";
  return { title: `${name} · Gigwright` };
}

export default async function MyGigDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireMusician();
  const { id } = await params;

  // Pull the gig, but only if the user is on its personnel list (any tenant).
  const gig = await db.gig.findFirst({
    where: {
      id,
      personnel: { some: { musician: { userId: user.id } } },
    },
    include: {
      venue: true,
      personnel: {
        include: { musician: true },
        orderBy: { position: "asc" },
      },
      owner: { select: { name: true, email: true } },
    },
  });
  if (!gig) notFound();

  // "Me" on this gig — we're the only personnel row with a real pay amount
  // we're allowed to show.
  const me = gig.personnel.find((p) => p.musician.userId === user.id);

  const bandleader =
    gig.owner?.name ?? gig.owner?.email?.split("@")[0] ?? "Bandleader";
  const dow = gig.startAt.toLocaleDateString("en-US", { weekday: "long" });
  const month = gig.startAt.toLocaleDateString("en-US", { month: "long" });
  const mapHref = mapLink(gig.venue ?? {});

  return (
    <div className="-mx-8 -mb-9 -mt-7">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-7 border-b border-line bg-paper-warm px-7 py-[22px]">
        <div className="border-r border-line pr-7 text-center font-serif leading-[0.95]">
          <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            {dow}
          </div>
          <span className="block text-[52px] font-light tracking-tight">
            {formatDayNum(gig.startAt)}
          </span>
          <div className="text-[12px] text-ink-soft">
            {month} {formatYear(gig.startAt)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            <Link href="/my-gigs" className="hover:text-ink">
              My gigs
            </Link>{" "}
            <span className="text-accent">·</span> for {bandleader}
          </div>
          <h2 className="font-serif text-[30px] font-normal leading-[1.05] tracking-tight">
            {gig.venue?.name ?? "TBD"}
          </h2>
          <div className="mt-1 text-[12px] text-ink-soft">
            {gig.venue?.city && `${gig.venue.city}, ${gig.venue.state}`}
          </div>
        </div>
      </div>

      {/* Body — three columns, read-only */}
      <div className="grid grid-cols-3">
        {/* Column 1: Times + Venue */}
        <div className="border-r border-line px-6 py-5">
          <Section title="Times">
            <div className="grid grid-cols-2 gap-3">
              <TimeTile label="Load in" value={formatTime(gig.loadInAt)} />
              <TimeTile
                label="Sound check"
                value={formatTime(gig.soundcheckAt)}
                sub="all lines run, instruments set up, ready to play at this time"
              />
              <TimeTile label="Call" value={formatTime(gig.callTimeAt)} />
              <TimeTile label="Downbeat" value={formatTime(gig.startAt)} />
            </div>
          </Section>

          {gig.venue && (
            <Section title="Venue">
              <div className="font-serif text-[17px]">{gig.venue.name}</div>
              <div className="mt-1.5 text-[13px] text-ink-soft">
                {gig.venue.addressL1 && (
                  <>
                    {gig.venue.addressL1}
                    <br />
                  </>
                )}
                {gig.venue.city && gig.venue.state && (
                  <>
                    {gig.venue.city}, {gig.venue.state} {gig.venue.postalCode}
                    <br />
                  </>
                )}
                {gig.venue.phone}
              </div>
              {mapHref && (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  Open in Maps →
                </a>
              )}
            </Section>
          )}
        </div>

        {/* Column 2: Tech + Materials + Set List */}
        <div className="border-r border-line px-6 py-5">
          <Section title="Tech & attire">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              {gig.sound && <Row k="Sound">{gig.sound}</Row>}
              {gig.soundContactName && (
                <Row k="Sound guy">
                  {gig.soundContactName}
                  {gig.soundContactPhone && (
                    <a
                      href={`tel:${gig.soundContactPhone.replace(/[^0-9+]/g, "")}`}
                      className="ml-2 text-accent underline decoration-accent/40 underline-offset-4"
                    >
                      {gig.soundContactPhone}
                    </a>
                  )}
                </Row>
              )}
              {gig.lights && <Row k="Lights">{gig.lights}</Row>}
              {gig.attire && <Row k="Attire">{gig.attire}</Row>}
              {gig.meal && <Row k="Meal">{gig.meal}</Row>}
              {!gig.sound &&
                !gig.soundContactName &&
                !gig.lights &&
                !gig.attire &&
                !gig.meal && (
                  <div className="col-span-2 text-[12px] text-ink-mute">
                    Not specified
                  </div>
                )}
            </div>
          </Section>

          {gig.materialsUrl && (
            <Section title="Gig materials">
              <a
                href={gig.materialsUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
              >
                Open materials folder →
              </a>
            </Section>
          )}

          {gig.setlistUrl && (
            <Section title="Set list">
              <a
                href={gig.setlistUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
              >
                📄 {gig.setlistFileName ?? "Open set list"}
              </a>
            </Section>
          )}
        </div>

        {/* Column 3: Who's playing + Your pay + Notes */}
        <div className="px-6 py-5">
          <Section title={`Personnel · ${gig.personnel.length}`}>
            <div className="flex flex-col gap-1.5 text-[13px]">
              {gig.personnel.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 ${
                    p.musician.userId === user.id
                      ? "font-semibold text-ink"
                      : "text-ink-soft"
                  }`}
                >
                  <span>{p.musician.name.split(" ")[0]}</span>
                  <span className="text-[11px] text-ink-mute">
                    {p.musician.isLeader
                      ? "Leader"
                      : p.musician.roles.slice(0, 1).join("")}
                  </span>
                  {p.musician.userId === user.id && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-accent">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {me && (
            <Section title="Your pay">
              <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[13px]">
                <Label>Amount</Label>
                <div className="font-serif text-[18px] tabular-nums text-accent">
                  {me.payCents ? formatMoneyCents(me.payCents) : "—"}
                </div>
                <Label>Status</Label>
                <div>
                  {me.paidAt ? (
                    <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-success">
                      Paid {me.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </Section>
          )}

          {gig.notes && (
            <Section title="Notes from the bandleader">
              <div className="whitespace-pre-wrap text-[13px] leading-[1.5] text-ink-soft">
                {gig.notes}
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="border-t border-line px-7 py-5">
        <Link
          href="/my-gigs"
          className="text-[12px] text-ink-soft hover:text-ink"
        >
          ← Back to my gigs
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[18px] border-b border-line pb-[18px] last:mb-0 last:border-b-0 last:pb-0">
      <h5 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
        {title}
      </h5>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-[3px] text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
      {children}
    </div>
  );
}

function TimeTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div className="font-serif text-[18px] font-normal tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] leading-[1.35] text-ink">{sub}</div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <Label>{k}</Label>
      <div className="text-ink">{children}</div>
    </>
  );
}

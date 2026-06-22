import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PayoutWorksheet } from "@/components/PayoutWorksheet";
import { InlineField } from "@/components/InlineField";
import { SetlistUpload } from "@/components/SetlistUpload";
import { LoadingMapUpload } from "@/components/LoadingMapUpload";
import { StagePlotUpload } from "@/components/StagePlotUpload";
import { ShareGigButton } from "@/components/ShareGigButton";
import { CloneGigButton } from "@/components/CloneGigButton";
import { ActivityList } from "@/components/ActivityList";
import { PushToQboButton } from "@/components/PushToQboButton";
import { SendUpdateButton } from "@/components/SendUpdateButton";
import { LatestUpdateBanner } from "@/components/LatestUpdateBanner";
import { LineupToggle } from "@/components/LineupToggle";
import { isPaid } from "@/lib/plan";
import {
  formatDayNum,
  formatLongDate,
  formatMoneyCents,
  formatTime,
  formatYear,
  mapLink,
} from "@/lib/format";

type Params = { id: string };

// Browser tab title = venue name. When you open Funky Biscuit, the tab reads
// "The Funky Biscuit · GigWright".
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) return { title: "GigWright" };
  const gig = await db.gig.findFirst({
    where: { id, ownerId: user.id },
    include: { venue: true },
  });
  const name = gig?.venue?.name ?? "Gig";
  // If the bandleader gave the gig an event name (e.g. "Patrick Lamb
  // Quartet" or "Smith Wedding"), prefer that for the tab title — it's
  // what they actually scan for. Falls back to the venue when blank.
  const titleHead = (gig as { eventName?: string | null } | null)?.eventName
    ? `${(gig as { eventName: string }).eventName} · ${name}`
    : name;
  return { title: `${titleHead} · GigWright` };
}

export default async function GigDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [gig, roster, qboConn, owner] = await Promise.all([
    db.gig.findFirst({
      where: { id, ownerId: user.id },
      include: {
        venue: true,
        personnel: {
          include: { musician: true },
          orderBy: { position: "asc" },
        },
        expenses: { orderBy: { position: "asc" } },
        activity: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.musician.findMany({
      where: { ownerId: user.id, isLeader: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        paymentMethod: true,
        payoutAddress: true,
        isLeader: true,
      },
    }),
    db.qboConnection.findUnique({
      where: { userId: user.id },
      select: { id: true, defaultExpenseAccountId: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { enabledPaymentMethods: true },
    }),
  ]);

  if (!gig) notFound();

  // ── Conflict detection ───────────────────────────────────────────
  // For every musician on this gig, find any OTHER gig they're booked
  // on whose start time falls within ±6 hours of this gig's downbeat —
  // wide enough to catch "load-in for one gig at 4 PM, soundcheck for
  // another at 5 PM" but narrow enough to avoid false positives across
  // a same-day morning rehearsal. Returns a map of musicianId →
  // conflicting gigs[] so the UI can render a yellow warning under
  // each conflicted personnel row. Skips CANCELLED on either side.
  const conflictWindowMs = 6 * 60 * 60 * 1000;
  const conflictStart = new Date(gig.startAt.getTime() - conflictWindowMs);
  const conflictEnd = new Date(gig.startAt.getTime() + conflictWindowMs);
  const musicianIdsOnGig = gig.personnel.map((p) => p.musicianId);
  const conflictRows =
    musicianIdsOnGig.length === 0
      ? []
      : await db.gigPersonnel.findMany({
          where: {
            musicianId: { in: musicianIdsOnGig },
            gigId: { not: gig.id },
            gig: {
              startAt: { gte: conflictStart, lt: conflictEnd },
              status: { not: "CANCELLED" },
            },
          },
          include: {
            gig: { include: { venue: true } },
          },
        });
  const conflictsByMusicianId = new Map<
    string,
    Array<{
      gigId: string;
      startAt: Date;
      venueName: string;
      eventName: string | null;
    }>
  >();
  for (const c of conflictRows) {
    const list = conflictsByMusicianId.get(c.musicianId) ?? [];
    list.push({
      gigId: c.gigId,
      startAt: c.gig.startAt,
      venueName: c.gig.venue?.name ?? "Venue TBD",
      eventName: c.gig.eventName,
    });
    conflictsByMusicianId.set(c.musicianId, list);
  }

  // ── QBO push state machine ───────────────────────────────────
  const sidePersonnel = gig.personnel.filter((p) => !p.musician.isLeader);
  const paidSidePersonnel = sidePersonnel.filter((p) => p.paidAt);
  const unpushedPaid = paidSidePersonnel.filter((p) => !p.qboBillId);

  type QboState =
    | { kind: "not-connected" }
    | { kind: "no-account" }
    | { kind: "partial"; paidCount: number; totalCount: number }
    | { kind: "nothing-to-push" }
    | { kind: "ready"; toPostCount: number }
    | { kind: "stale"; lastSyncedAt: Date }
    | { kind: "synced"; lastSyncedAt: Date };

  let qboState: QboState;
  if (!qboConn) {
    qboState = { kind: "not-connected" };
  } else if (!qboConn.defaultExpenseAccountId) {
    qboState = { kind: "no-account" };
  } else if (sidePersonnel.length === 0) {
    qboState = { kind: "nothing-to-push" };
  } else if (paidSidePersonnel.length < sidePersonnel.length) {
    qboState = {
      kind: "partial",
      paidCount: paidSidePersonnel.length,
      totalCount: sidePersonnel.length,
    };
  } else if (unpushedPaid.length > 0) {
    qboState = { kind: "ready", toPostCount: unpushedPaid.length };
  } else if (gig.qboSyncedAt && gig.updatedAt > gig.qboSyncedAt) {
    qboState = { kind: "stale", lastSyncedAt: gig.qboSyncedAt };
  } else if (gig.qboSyncedAt) {
    qboState = { kind: "synced", lastSyncedAt: gig.qboSyncedAt };
  } else {
    qboState = { kind: "nothing-to-push" };
  }

  const bandPayCents = gig.personnel
    .filter((p) => !p.musician.isLeader)
    .reduce((s, p) => s + p.payCents, 0);
  const paidCount = gig.personnel.filter((p) => p.paidAt).length;
  const sideCount = gig.personnel.filter((p) => !p.musician.isLeader).length;
  const net =
    (gig.clientPayCents ?? 0) - bandPayCents;

  const dow = gig.startAt.toLocaleDateString("en-US", { weekday: "long" });
  const month = gig.startAt.toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="-mx-8 -mb-9 -mt-7">
      {/* Header — stacks on mobile, becomes [date | title | actions] on md+ */}
      <div className="flex flex-col gap-5 border-b border-line bg-paper-warm px-5 py-5 md:grid md:grid-cols-[auto_1fr_auto] md:items-center md:gap-7 md:px-7 md:py-[22px]">
        <div className="flex items-end gap-4 border-line pb-4 text-left font-serif leading-[0.95] md:block md:border-r md:pb-0 md:pr-7 md:text-center">
          <div className="flex flex-col">
            <div className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-accent md:mb-1">
              {dow}
            </div>
            <span className="block text-[44px] font-light tracking-tight md:text-[52px]">
              {formatDayNum(gig.startAt)}
            </span>
          </div>
          <div className="text-[12px] text-ink-soft md:mt-0">
            {month} {formatYear(gig.startAt)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            <Link href="/dashboard" className="hover:text-ink">
              Gigs
            </Link>{" "}
            <span className="text-accent">·</span> {dow}
          </div>
          <h2 className="font-serif text-[26px] font-normal leading-[1.05] tracking-tight md:text-[30px]">
            {gig.venue?.name ?? "TBD"}
          </h2>
          {gig.eventName && (
            <div className="mt-1 font-serif text-[15px] italic leading-tight text-accent md:text-[16px]">
              {gig.eventName}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft">
            {gig.venue?.city && (
              <span>
                {gig.venue.city}, {gig.venue.state}
              </span>
            )}
            {/* Status pill hidden on mobile — users know the state of a gig
                they're already inside. Kept for desktop overview scanning. */}
            <span className="hidden items-center gap-2 lg:inline-flex">
              {gig.venue?.city && <span className="text-ink-mute">·</span>}
              <StatusPill status={gig.status} />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/gigs/${gig.id}/edit`}
            className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-paper-warm"
          >
            Edit
          </Link>
          <a
            href="#payout"
            className="rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent hover:text-paper"
          >
            Finance
          </a>
          <PushToQboButton gigId={gig.id} state={qboState} />
          <SendUpdateButton gigId={gig.id} />
        </div>
      </div>

      {/* Latest update banner — what was just sent in the most recent
          "Send update" fanout. Lives above the three columns so the
          bandleader sees their own change-note exactly the way the band
          (and any musician opening the public sheet) will see it. */}
      {(gig.lastUpdateLabel || gig.lastUpdateMessage) && gig.lastUpdateAt && (
        <LatestUpdateBanner
          label={gig.lastUpdateLabel}
          message={gig.lastUpdateMessage}
          at={gig.lastUpdateAt}
        />
      )}

      {/* Three columns — stack vertically on mobile, 3-up on lg+
          Reading flow follows the bandleader's mental model:
            Column 1 — WHO / WHERE  (venue · personnel · money)
            Column 2 — WHEN / WHAT  (times · tech & attire · stage plot)
            Column 3 — PAPERWORK    (set list · materials · loading · other notes · share · clone · activity)
          Venue is top-left because the first question on any gig sheet
          is "where am I going." Other notes lives in Column 3 (no longer
          a full-width band below) to keep the vertical rhythm tight. */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* ── Column 1 — WHO / WHERE ───────────────────────────────── */}
        <div className="border-b border-line px-5 py-5 md:px-6 lg:border-b-0 lg:border-r">
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
              {(() => {
                const href = mapLink(gig.venue);
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                  >
                    Open in Maps →
                  </a>
                ) : null;
              })()}
            </Section>
          )}

          {/* Event name — optional override / adornment for what's
              actually happening at this venue. Examples: "Patrick Lamb
              Quartet", "Smith Wedding", "NYE Show". Lives between Venue
              and Personnel so it reads as "where + what" before "who."
              Click-to-edit InlineField; empty when blank. */}
          <Section title="Event name">
            <InlineField
              gigId={gig.id}
              field="eventName"
              initialValue={gig.eventName}
              placeholder="Patrick Lamb Quartet · Smith Wedding · NYE Show…"
            />
          </Section>

          {/* Personnel — custom section so we can place a delicate "Include
              in outgoing emails" eyebrow on the right of the title row,
              aligned over the per-row checkbox column. Same letterpress
              vocabulary used elsewhere on the page. */}
          <div className="mb-[18px] border-b border-line pb-[18px]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h5 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                Personnel &middot; {gig.personnel.length} on
              </h5>
              <h5
                className="max-w-[180px] text-right text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.16em] text-ink-mute"
                title="When checked, this person's name and contact info appear in the Lineup section of emails to the rest of the band."
              >
                Include in outgoing emails
              </h5>
            </div>
            <div className="flex flex-col gap-2.5">
              {gig.personnel.map((p) => {
                const conflicts = conflictsByMusicianId.get(p.musicianId);
                return (
                <div
                  key={p.id}
                  className="flex flex-col gap-1"
                >
                <div className="grid grid-cols-[24px_1fr_auto_auto_18px] items-center gap-2.5">
                  {/* Avatar + name + meta are a Link to the musician's
                      edit page so the bandleader can jump to their
                      profile (send invite, change contact info, etc.)
                      directly from any gig sheet without having to
                      navigate through the Roster page. LineupToggle
                      stays outside the Link so the checkbox isn't
                      a nested-interactive issue. */}
                  <Link
                    href={`/roster/${p.musicianId}/edit`}
                    className="contents"
                  >
                    <Avatar
                      initials={p.musician.initials ?? p.musician.name.slice(0, 2).toUpperCase()}
                      leader={p.musician.isLeader}
                      avatarUrl={p.musician.avatarUrl}
                      name={p.musician.name}
                    />
                    <div className="-mx-1.5 rounded-md px-1.5 py-1 hover:bg-paper-warm/70">
                      <div className="font-serif text-[14px] font-medium underline-offset-4 hover:text-accent hover:underline decoration-accent/40">
                        {p.musician.name}
                      </div>
                      <div className="text-[11px] text-ink-mute">
                        {p.musician.isLeader ? "Leader · " : ""}
                        {p.musician.roles.join(", ")}
                        {p.musician.paymentMethod && !p.musician.isLeader && (
                          <span className="text-ink-soft">
                            {" · "}
                            {paymentMethodLabel(p.musician.paymentMethod)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="font-serif text-[14px] tabular-nums">
                    {p.musician.isLeader ? "—" : formatMoneyCents(p.payCents)}
                  </div>
                  {!p.musician.isLeader && (
                    <div
                      className={`h-[7px] w-[7px] rounded-full ${
                        p.paidAt ? "bg-success" : "bg-line-strong"
                      }`}
                      title={p.paidAt ? "Paid" : "Unpaid"}
                    />
                  )}
                  {p.musician.isLeader && <div />}
                  <LineupToggle
                    gigId={gig.id}
                    personnelId={p.id}
                    initial={p.includeInLineup}
                    musicianName={p.musician.name}
                  />
                </div>
                {/* Conflict warning — soft yellow, ml-[34px] to align under
                    the name (not the avatar). Doesn't block, just informs.
                    Lists each conflicting gig with venue + downbeat time,
                    each one a click-through to the conflicting gig page so
                    the bandleader can resolve the double-book in one hop. */}
                {conflicts && conflicts.length > 0 && (
                  <div
                    className="ml-[34px] rounded border border-warn/30 bg-warn/5 px-2 py-1 text-[10.5px] leading-snug text-warn"
                    role="alert"
                  >
                    <span className="font-semibold uppercase tracking-[0.08em]">
                      ⚠ Conflict ·
                    </span>{" "}
                    {p.musician.name.split(" ")[0]} is also on{" "}
                    {conflicts.map((c, idx) => (
                      <span key={c.gigId}>
                        {idx > 0 && " · "}
                        <Link
                          href={`/gigs/${c.gigId}`}
                          className="font-medium underline decoration-warn/40 underline-offset-2 hover:decoration-warn"
                        >
                          {c.eventName || c.venueName}
                        </Link>{" "}
                        <span className="text-warn/80">
                          (
                          {c.startAt.toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          )
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                </div>
                );
              })}
            </div>
          </div>

          <div className="hidden lg:block">
          <Section title="Money at a glance">
            <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
              <Label>Gross</Label>
              <div className="font-serif tabular-nums text-ink">
                {formatMoneyCents(gig.clientPayCents)}
              </div>
              <Label>Band</Label>
              <div className="font-serif tabular-nums text-ink-soft">
                {formatMoneyCents(bandPayCents)}
                {sideCount > 0 && (
                  <span className="ml-2 text-[10px] text-ink-mute">
                    {paidCount} / {sideCount} paid
                  </span>
                )}
              </div>
              <Label className="text-accent">Net</Label>
              <div>
                <em className="font-serif text-[22px] font-light tabular-nums text-accent not-italic">
                  {formatMoneyCents(net)}
                </em>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-ink-mute">
              Full payout worksheet below &mdash; edit every line.
            </div>
          </Section>
          </div>
        </div>

        {/* ── Column 2 — WHEN / WHAT ────────────────────────────────── */}
        <div className="border-b border-line px-5 py-5 md:px-6 lg:border-b-0 lg:border-r">
          <Section title="Times">
            <div className="grid grid-cols-2 gap-3">
              <TimeTile label="Load in" value={formatTime(gig.loadInAt)} />
              <TimeTile
                label="Sound check"
                value={formatTime(gig.soundcheckAt)}
                sub="all lines run, instruments set up, ready to play at this time"
              />
              <TimeTile
                label="Sound check complete"
                value={formatTime(gig.soundcheckEndAt)}
                sub="band is freed up after this time"
              />
              <TimeTile label="Call" value={formatTime(gig.callTimeAt)} />
              <TimeTile
                label={gig.secondStartAt ? "1st downbeat" : "Downbeat"}
                value={formatTime(gig.startAt)}
              />
              <TimeTile
                label={gig.secondStartAt ? "1st finish" : "Finish"}
                value={formatTime(gig.endAt)}
              />
              {gig.secondStartAt && (
                <TimeTile
                  label="2nd downbeat"
                  value={formatTime(gig.secondStartAt)}
                />
              )}
              {gig.secondEndAt && (
                <TimeTile
                  label="2nd finish"
                  value={formatTime(gig.secondEndAt)}
                />
              )}
            </div>
          </Section>

          <Section title="Tech & attire">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <Label>Sound</Label>
              <InlineField
                gigId={gig.id}
                field="sound"
                initialValue={gig.sound}
                placeholder="House FOH, band sound, etc."
              />
              <Label>Sound guy</Label>
              <InlineField
                gigId={gig.id}
                field="soundContactName"
                initialValue={gig.soundContactName}
                placeholder="Name of the house engineer"
              />
              <Label>Phone</Label>
              <InlineField
                gigId={gig.id}
                field="soundContactPhone"
                initialValue={gig.soundContactPhone}
                placeholder="(555) 555-5555"
              />
              <Label>Lights</Label>
              <InlineField
                gigId={gig.id}
                field="lights"
                initialValue={gig.lights}
                placeholder="House, band, DJ…"
              />
              <Label>Attire</Label>
              <InlineField
                gigId={gig.id}
                field="attire"
                initialValue={gig.attire}
                placeholder="Black on black, jacket no tie…"
              />
              <Label>Meal</Label>
              <InlineField
                gigId={gig.id}
                field="meal"
                initialValue={gig.meal}
                placeholder="After check · green room"
              />
            </div>
          </Section>

          {/* Stage plot — PDF or image. Sits as its own section under Tech
              & attire so the file uploader has space to breathe and the
              text-input grid above stays clean. Email/portal renders this
              as a clickable "Stage plot ↗" link, not embedded inline. */}
          <Section title="Stage plot">
            <StagePlotUpload
              gigId={gig.id}
              initialUrl={gig.stagePlotUrl}
              initialFileName={gig.stagePlotFileName}
            />
          </Section>
        </div>

        {/* ── Column 3 — PAPERWORK & META ───────────────────────────── */}
        <div className="px-5 py-5 md:px-6">
          <Section title="Set list">
            {isPaid(user.plan) ? (
              <>
                <SetlistUpload
                  gigId={gig.id}
                  initialUrl={gig.setlistUrl}
                  initialFileName={gig.setlistFileName}
                />
                <div className="mt-2 text-[11px] leading-[1.4] text-ink-mute">
                  If this changes you will all get a text and email.
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-accent/30 bg-accent/5 px-4 py-3">
                <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-paper">
                  Pro
                </span>
                <span className="text-[12.5px] text-ink-soft">
                  Set list PDF uploads are a Pro feature.
                </span>
                <Link
                  href="/settings/billing?upgrade=setlistUpload"
                  className="ml-auto rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-[#611B11]"
                >
                  Upgrade →
                </Link>
              </div>
            )}
          </Section>

          <Section title="Gig materials">
            <InlineField
              gigId={gig.id}
              field="materialsUrl"
              initialValue={gig.materialsUrl}
              placeholder="Paste link (Google Drive, Dropbox, OneDrive…)"
              displayAs="link"
            />
          </Section>

          <div className="hidden lg:block">
          <Section title="Special loading instructions">
            {/* Inline-field IS this section's primary content — no
                redundant sub-label needed since "Special loading
                instructions" already names it. Map image and the
                alternate map link keep their sub-labels because
                they're a different kind of input. */}
            <InlineField
              gigId={gig.id}
              field="loadingInfo"
              initialValue={gig.loadingInfo}
              placeholder="e.g. Alley entrance, knock on service door, elevator to 3rd floor…"
              multiline
            />
            <div className="mt-4">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                Map image
              </div>
              <LoadingMapUpload
                gigId={gig.id}
                initialUrl={gig.loadingMapUrl}
              />
            </div>
            <div className="mt-4">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                Alternate map link
              </div>
              <InlineField
                gigId={gig.id}
                field="loadingMapLink"
                initialValue={gig.loadingMapLink}
                placeholder="Paste a Google/Apple Maps pin link"
                displayAs="link"
                linkLabel="Open map ↗"
              />
            </div>
          </Section>
          </div>

          {/* Other notes — was a full-width band below all three columns,
              moved here so the right column carries all of the soft-text
              paperwork in one place. Same field name, same email surface,
              so the "I type here, this comes out there" mental model
              still holds. */}
          <Section title="Other notes">
            <InlineField
              gigId={gig.id}
              field="notes"
              initialValue={gig.notes}
              multiline
              placeholder="Parking, green room, audience vibe, anything worth remembering…"
            />
          </Section>

          {/* Consolidated guest list — every musician's contribution from
              their /my-gigs/[id] page rolled into one block. Shows
              per-musician sections with a name count + a grand total at
              the top, so the bandleader has a single thing to hand the
              venue. Renders nothing when no one has submitted yet, so a
              fresh gig page doesn't have a sad empty section. */}
          {(() => {
            const contributors = gig.personnel.filter(
              (p) =>
                p.guestList &&
                p.guestList.trim() !== "" &&
                !p.musician.isLeader,
            );
            if (contributors.length === 0) {
              return (
                <Section title="Guest list">
                  <p className="text-[12px] italic text-ink-mute">
                    No guests submitted yet. Musicians can add theirs from
                    their My gigs page.
                  </p>
                </Section>
              );
            }
            const totalGuests = contributors.reduce(
              (sum, p) =>
                sum +
                (p.guestList ?? "")
                  .split("\n")
                  .filter((l) => l.trim() !== "").length,
              0,
            );
            return (
              <Section title="Guest list">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  {totalGuests} {totalGuests === 1 ? "guest" : "guests"} · {contributors.length}{" "}
                  {contributors.length === 1 ? "musician" : "musicians"} submitted
                </div>
                <div className="flex flex-col gap-3">
                  {contributors.map((p) => {
                    const count = (p.guestList ?? "")
                      .split("\n")
                      .filter((l) => l.trim() !== "").length;
                    return (
                      <div
                        key={p.id}
                        className="rounded-md border border-line bg-paper-warm/50 px-3 py-2.5"
                      >
                        <div className="flex items-baseline justify-between text-[11.5px] text-ink-soft">
                          <span className="font-semibold text-ink">
                            {p.musician.name}
                          </span>
                          <span className="tabular-nums text-ink-mute">
                            {count} {count === 1 ? "guest" : "guests"}
                          </span>
                        </div>
                        <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.5] text-ink">
                          {p.guestList}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            );
          })()}

          <Section title="Share gig sheet">
            <ShareGigButton gigId={gig.id} />
          </Section>

          <div className="hidden lg:block">
          <Section title="Clone this gig">
            <div className="flex items-start gap-3">
              <CloneGigButton
                gigId={gig.id}
                sourceStartAt={gig.startAt.toISOString().slice(0, 10)}
              />
              <span className="flex-1 text-[11px] leading-[1.45] text-ink-mute">
                Repeat this gig? Pick a date — clone keeps the same venue,
                band, and clock times.
              </span>
            </div>
          </Section>
          </div>

          <div className="hidden lg:block">
          <Section title="Activity">
            <ActivityList
              entries={gig.activity.map((a) => ({
                id: a.id,
                date: `${a.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })} ${a.createdAt.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}`,
                summary: a.summary,
              }))}
            />
          </Section>
          </div>
        </div>
      </div>

      {/* Full Payout Worksheet — live totaling, editable everything */}
      <div className="border-t border-line bg-paper-warm/40 px-7 py-6">
        <PayoutWorksheet
          gigId={gig.id}
          gigTitle={
            gig.venue?.name
              ? `${gig.venue.name} · ${gig.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : `Gig · ${gig.startAt.toLocaleDateString()}`
          }
          initialClientPayCents={gig.clientPayCents}
          initialPrivateFinanceNotes={gig.privateFinanceNotes}
          personnel={gig.personnel.map((p) => ({
            id: p.id,
            musicianId: p.musicianId,
            musicianName: p.musician.name,
            isLeader: p.musician.isLeader,
            roleLabel: p.roleLabel ?? null,
            paymentMethod: p.musician.paymentMethod ?? null,
            payoutAddress: p.musician.payoutAddress ?? null,
            payCents: p.payCents,
            paidAt: p.paidAt,
            // Passed through so the worksheet can show inline Send-invite
            // links on musicians who have an email but haven't been
            // invited yet — surfaces the "pay this person but they
            // haven't set a method" workflow at the moment of action.
            email: p.musician.email ?? null,
            invitedAt: p.musician.invitedAt ?? null,
          }))}
          expenses={gig.expenses.map((e) => ({
            id: e.id,
            label: e.label,
            amountCents: e.amountCents,
            position: e.position,
            paidAt: e.paidAt,
            kind: e.kind,
            miles: e.miles,
            days: e.days,
          }))}
          roster={roster.map((m) => ({
            id: m.id,
            name: m.name,
            paymentMethod: m.paymentMethod ?? null,
            payoutAddress: m.payoutAddress ?? null,
            isLeader: m.isLeader,
          }))}
          enabledPaymentMethods={owner?.enabledPaymentMethods ?? []}
        />
      </div>

      <div className="border-t border-line px-7 py-5">
        <Link
          href="/dashboard"
          className="text-[12px] text-ink-soft hover:text-ink"
        >
          ← Back to gigs
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

function Avatar({
  initials,
  leader,
  avatarUrl,
  name,
}: {
  initials: string;
  leader?: boolean;
  avatarUrl?: string | null;
  name?: string;
}) {
  return (
    <div
      className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ${
        leader ? "bg-accent-soft text-accent" : "bg-paper-deep text-ink-soft"
      }`}
    >
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={name ?? initials}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`pt-[3px] text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function displayUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host + (url.pathname.length > 1 ? url.pathname : "");
  } catch {
    return u;
  }
}

function KV({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
      {children}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <Label>{k}</Label>
      <div>{children}</div>
    </>
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
        <div className="mt-1 text-[11px] leading-[1.35] text-ink">
          {sub}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-ink text-paper border-ink",
    HOLD: "text-warn border-warn/30",
    INQUIRY: "text-ink-mute border-line-strong",
    PLAYED: "text-ink-soft border-line-strong opacity-70",
    CANCELLED: "text-accent border-accent/30 line-through",
  };
  return (
    <span
      className={`ml-1 inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${styles[status] ?? styles.CONFIRMED}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function paymentMethodLabel(m: string): string {
  const map: Record<string, string> = {
    VENMO: "Venmo",
    PAYPAL: "PayPal",
    ZELLE: "Zelle",
    CASHAPP: "Cash App",
    CASH: "Cash",
    CHECK: "Check",
    DIRECT_DEPOSIT: "Direct deposit",
    OTHER: "Other",
  };
  return map[m] ?? m;
}

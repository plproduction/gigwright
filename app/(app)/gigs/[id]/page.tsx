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
import { RoomingInfo } from "@/components/RoomingInfo";
import { ShareGigButton } from "@/components/ShareGigButton";
import { CloneGigButton } from "@/components/CloneGigButton";
import { ActivityList } from "@/components/ActivityList";
import { PushToQboButton } from "@/components/PushToQboButton";
import { SendUpdateButton } from "@/components/SendUpdateButton";
import { LatestUpdateBanner } from "@/components/LatestUpdateBanner";
import { GuestApprovalCheckbox } from "@/components/GuestApprovalCheckbox";
import { LeaderGuestListInput } from "@/components/LeaderGuestListInput";
import { LineupToggle } from "@/components/LineupToggle";
import { DoNotEmailToggle } from "@/components/DoNotEmailToggle";
import { ContractUpload } from "@/components/ContractUpload";
import { GigContractInvoicePanel } from "@/components/contracts/GigContractInvoicePanel";
import { RemoveLineupButton } from "@/components/RemoveLineupButton";
import { CrewControls } from "@/components/CrewControls";
import { isPaid } from "@/lib/plan";
import { WITH_ROLES, roleNamesBesidesLeader } from "@/lib/musician-roles";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { applyLineupToGig } from "@/lib/actions/roles";
import { defaultProgramLine } from "@/lib/actions/contracts";
import {
  formatDayNum,
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

  const [gig, roster, qboConn, owner, currentCrewCount, lineups] =
    await Promise.all([
      db.gig.findFirst({
        where: { id, ownerId: user.id },
        include: {
          venue: true,
          personnel: {
            include: { musician: { include: { ...WITH_ROLES } } },
            orderBy: { position: "asc" },
          },
          expenses: { orderBy: { position: "asc" } },
          activity: { orderBy: { createdAt: "desc" } },
          contract: true,
          invoice: true,
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
      db.musician.count({ where: { ownerId: user.id, isCrew: true } }),
      // Lineups, with enough of each to label the dropdown ("The Floor ·
      // 7 piece · 6 chairs") without a second query per row.
      db.lineup.findMany({
        where: { ownerId: user.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          sizeLabel: true,
          roles: { select: { count: true } },
        },
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

  const bandPayCents = sidePersonnel.reduce((s, p) => s + p.payCents, 0);
  const paidCount = gig.personnel.filter((p) => p.paidAt).length;
  const sideCount = sidePersonnel.length;
  // Personnel rows flagged "Do not email" for this gig — surfaced as a
  // quiet count next to the Personnel heading.
  const doNotEmailCount = sidePersonnel.filter((p) => p.doNotEmail).length;
  const net = (gig.clientPayCents ?? 0) - bandPayCents;

  const dow = gig.startAt.toLocaleDateString("en-US", { weekday: "long" });
  const month = gig.startAt.toLocaleDateString("en-US", { month: "long" });

  // ── Guest list bookkeeping ───────────────────────────────────────
  // Computed up here rather than inside the render so the zone below
  // can ask "is there anything in the guest list yet?" when deciding
  // whether the section shows inline or waits in the add drawer.
  const leaderRow = gig.personnel.find((p) => p.musician.isLeader);
  const guestContributors = gig.personnel.filter(
    (p) => p.guestList && p.guestList.trim() !== "" && !p.musician.isLeader,
  );
  // name → musician-names[] index so each row can show a quiet "also on
  // X's list" note. Case-insensitive — venues look names up by spelling
  // more than by case.
  const dupeIndex = new Map<string, string[]>();
  for (const p of guestContributors) {
    for (const line of splitGuestList(p.guestList)) {
      const key = line.toLowerCase();
      const prev = dupeIndex.get(key) ?? [];
      prev.push(p.musician.name);
      dupeIndex.set(key, prev);
    }
  }
  const leaderApprovedCount = leaderRow ? leaderRow.approvedGuests.length : 0;
  let totalSubmitted = 0;
  let totalApproved = 0;
  for (const p of guestContributors) {
    const lines = splitGuestList(p.guestList);
    totalSubmitted += lines.length;
    const approvedSet = new Set(p.approvedGuests);
    for (const line of lines) if (approvedSet.has(line)) totalApproved++;
  }
  const totalOnDoor = totalApproved + leaderApprovedCount;

  const fanoutCount = gig.activity.filter(
    (a) => a.action === "fanout_sent",
  ).length;

  // Prefill for the contract's program line. Describes the band as a
  // configuration ("Six Piece"), never as a list of names, so swapping a
  // player never contradicts a signed agreement. Only computed when
  // there's no contract yet — an existing one carries its own frozen
  // snapshot and must not be second-guessed here.
  const suggestedProgram = gig.contract
    ? null
    : await defaultProgramLine(gig.id, user.name ?? "Artist");

  // Every lineup apply still standing — matching removeAppliedLineup,
  // which undoes them together. Counting only the latest would read
  // "0 players" after applying the same lineup twice, since the second
  // apply seats nobody new. Applies written before the payload existed
  // carry nothing to undo and are ignored, so the button never offers
  // to do something it can't.
  const appliedLineup = (() => {
    const live = gig.activity
      .filter((a) => a.action === "lineup_applied")
      .map((a) => (a.payload ?? {}) as {
        lineupName?: string;
        personnelIds?: string[];
        undoneAt?: string | null;
      })
      .filter((p) => !p.undoneAt && Array.isArray(p.personnelIds));
    if (live.length === 0) return null;

    const ids = new Set(live.flatMap((p) => p.personnelIds ?? []));
    // Only count rows still on the gig — a player removed by hand since
    // shouldn't inflate the number in the confirm.
    const onGig = new Set(gig.personnel.map((p) => p.id));
    const stillHere = [...ids].filter((id) => onGig.has(id));
    if (stillHere.length === 0) return null;

    const names = [...new Set(live.map((p) => p.lineupName).filter(Boolean))];
    return {
      lineupName: names.length > 1 ? names.join(" + ") : (names[0] ?? "that lineup"),
      playerCount: stillHere.length,
    };
  })();

  // ── Zone contents ────────────────────────────────────────────────
  // Every panel declares whether it has anything in it yet. Filled
  // panels render inline; empty ones collapse into a single "Add to
  // this gig" drawer per zone, so a fresh gig shows four or five real
  // panels instead of twenty-two mostly-blank ones. Nothing is
  // removed — the editor for an empty panel is one click away, and it
  // is the same editor either way.
  const advancePanels: Panel[] = [
    {
      key: "event-name",
      title: "Event name",
      filled: Boolean(gig.eventName),
      node: (
        <InlineField
          gigId={gig.id}
          field="eventName"
          initialValue={gig.eventName}
          placeholder="Patrick Lamb Quartet · Smith Wedding · NYE Show…"
        />
      ),
    },
    {
      key: "client-paper",
      title: "Client contract & invoice",
      filled: Boolean(gig.contract || gig.invoice),
      wide: true,
      node: (
        <GigContractInvoicePanel
          gigId={gig.id}
          clientPortalToken={gig.clientPortalToken}
          letterheadReady={Boolean(user.name || user.businessName)}
          suggestedProgram={suggestedProgram}
          contract={
            gig.contract
              ? {
                  status: gig.contract.status,
                  contractNumber: gig.contract.contractNumber,
                  purchaserName: gig.contract.purchaserName,
                  purchaserEmail: gig.contract.purchaserEmail,
                  purchaserPhone: gig.contract.purchaserPhone,
                  feeCents: gig.contract.feeCents,
                  depositCents: gig.contract.depositCents,
                  performanceWindow: gig.contract.performanceWindow,
                  program: gig.contract.program,
                }
              : null
          }
          invoice={
            gig.invoice
              ? {
                  status: gig.invoice.status,
                  invoiceNumber: gig.invoice.invoiceNumber,
                  totalCents: gig.invoice.totalCents,
                  paidCents: gig.invoice.paidCents,
                }
              : null
          }
        />
      ),
    },
    {
      key: "their-contract",
      title: "Their contract (private)",
      filled: Boolean(gig.contractUrl),
      node: (
        <>
          <ContractUpload
            gigId={gig.id}
            initialUrl={gig.contractUrl}
            initialFileName={gig.contractFileName}
          />
          <div className="mt-2 text-[11px] leading-[1.4] text-ink-mute">
            The paperwork the venue sent you. Only you see this — never
            shared with the band or the venue.
          </div>
        </>
      ),
    },
  ];

  const dayPanels: Panel[] = [
    {
      key: "tech",
      title: "Tech & attire",
      filled: Boolean(
        gig.sound ||
          gig.soundContactName ||
          gig.soundContactPhone ||
          gig.lights ||
          gig.attire ||
          gig.meal,
      ),
      node: (
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
      ),
    },
    {
      key: "stage-plot",
      title: "Stage plot",
      filled: Boolean(gig.stagePlotUrl),
      node: (
        <StagePlotUpload
          gigId={gig.id}
          initialUrl={gig.stagePlotUrl}
          initialFileName={gig.stagePlotFileName}
        />
      ),
    },
    {
      key: "set-list",
      title: "Set list",
      // Unpaid plans can't upload one, so the Pro card waits in the
      // drawer rather than taking a panel on every single gig page.
      filled: isPaid(user.plan) && Boolean(gig.setlistUrl),
      node: isPaid(user.plan) ? (
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
      ),
    },
    {
      key: "rooming",
      title: "Rooming",
      filled: Boolean(gig.roomingInfo || gig.roomingUrl),
      node: (
        <RoomingInfo
          gigId={gig.id}
          initialInfo={gig.roomingInfo}
          initialUrl={gig.roomingUrl}
          initialFileName={gig.roomingFileName}
        />
      ),
    },
    {
      key: "loading",
      title: "Special loading instructions",
      filled: Boolean(
        gig.loadingInfo || gig.loadingMapUrl || gig.loadingMapLink,
      ),
      node: (
        <>
          <InlineField
            gigId={gig.id}
            field="loadingInfo"
            initialValue={gig.loadingInfo}
            placeholder="e.g. Alley entrance, knock on service door, elevator to 3rd floor…"
            multiline
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                Map image
              </div>
              <LoadingMapUpload gigId={gig.id} initialUrl={gig.loadingMapUrl} />
            </div>
            <div>
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
          </div>
        </>
      ),
    },
    {
      key: "materials",
      title: "Gig materials",
      filled: Boolean(gig.materialsUrl),
      node: (
        <InlineField
          gigId={gig.id}
          field="materialsUrl"
          initialValue={gig.materialsUrl}
          placeholder="Paste link (Google Drive, Dropbox, OneDrive…)"
          displayAs="link"
        />
      ),
    },
    {
      key: "notes",
      title: "Other notes",
      filled: Boolean(gig.notes),
      node: (
        <InlineField
          gigId={gig.id}
          field="notes"
          initialValue={gig.notes}
          multiline
          placeholder="Parking, green room, audience vibe, anything worth remembering…"
        />
      ),
    },
    {
      key: "guest-list",
      title: "Guest list",
      filled: guestContributors.length > 0 || leaderApprovedCount > 0,
      wide: true,
      node: (
        <>
          {/* (1) Leader's own guests — always shown when the leader is on
              the gig's personnel (which they usually are). */}
          {leaderRow && (
            <div className="mb-4">
              <LeaderGuestListInput
                gigId={gig.id}
                initialValue={leaderRow.guestList}
              />
            </div>
          )}

          {/* (2) Consolidated submissions from the band. */}
          {guestContributors.length === 0 ? (
            <p className="text-[12px] italic text-ink-mute">
              No band guests submitted yet. Musicians add theirs from their My
              gigs page.
            </p>
          ) : (
            <>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                {totalApproved} / {totalSubmitted} approved ·{" "}
                {guestContributors.length}{" "}
                {guestContributors.length === 1 ? "musician" : "musicians"}{" "}
                submitted
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {guestContributors.map((p) => {
                  const lines = splitGuestList(p.guestList);
                  const approvedSet = new Set(p.approvedGuests);
                  const approvedCount = lines.filter((l) =>
                    approvedSet.has(l),
                  ).length;
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
                          {approvedCount} / {lines.length} approved
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {lines.map((line, i) => {
                          // Other musicians who also submitted this name.
                          const others = (
                            dupeIndex.get(line.toLowerCase()) ?? []
                          ).filter((n) => n !== p.musician.name);
                          return (
                            <div
                              key={`${p.id}-${i}-${line}`}
                              className="flex flex-col"
                            >
                              <GuestApprovalCheckbox
                                personnelId={p.id}
                                name={line}
                                initialApproved={approvedSet.has(line)}
                              />
                              {others.length > 0 && (
                                <div className="ml-5 mt-0.5 text-[10.5px] italic text-warn">
                                  also on {others.join(", ")}&rsquo;s list —
                                  approve only one
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* (3) Print door list link. */}
          {totalOnDoor > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <div className="text-[11px] text-ink-mute">
                <span className="font-semibold text-success">
                  {totalOnDoor}
                </span>{" "}
                {totalOnDoor === 1 ? "name" : "names"} on the door list
              </div>
              <Link
                href={`/gigs/${gig.id}/guests/print`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft hover:border-accent hover:text-accent"
              >
                Print door list →
              </Link>
            </div>
          )}
        </>
      ),
    },
  ];

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
            <span className="inline-flex items-center gap-2">
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
          "Send update" fanout, shown exactly the way the band will see it. */}
      {(gig.lastUpdateLabel || gig.lastUpdateMessage) && gig.lastUpdateAt && (
        <LatestUpdateBanner
          label={gig.lastUpdateLabel}
          message={gig.lastUpdateMessage}
          at={gig.lastUpdateAt}
        />
      )}

      {/* ── The glance ───────────────────────────────────────────────
          The four questions you ask about a gig you are standing in
          front of — when do I get there, when do we play, where is it,
          what does it pay. Always visible, never collapsed, above the
          three zones. Times keep every slot even when blank: an empty
          Load in is the reminder to go ask the venue for one. */}
      <div className="border-b border-line bg-paper px-6 py-6 md:px-8">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
          <div className="grid grid-cols-2 items-start gap-x-6 gap-y-5 sm:grid-cols-4">
            {/* Sound's load in appears only once you've entered one; the
                musicians' slot always shows, blank included, because an
                empty one is the reminder to go ask the venue. */}
            {gig.soundLoadInAt && (
              <TimeTile
                label="Load in · sound"
                value={formatTime(gig.soundLoadInAt)}
                sub="PA and backline"
              />
            )}
            <TimeTile
              label={gig.soundLoadInAt ? "Load in · musicians" : "Load in"}
              value={formatTime(gig.loadInAt)}
            />
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
              accent
            />
            <TimeTile
              label={gig.secondStartAt ? "1st finish" : "Finish"}
              value={formatTime(gig.endAt)}
            />
            {gig.secondStartAt && (
              <TimeTile
                label="2nd downbeat"
                value={formatTime(gig.secondStartAt)}
                accent
              />
            )}
            {gig.secondEndAt && (
              <TimeTile label="2nd finish" value={formatTime(gig.secondEndAt)} />
            )}
          </div>

          <div className="flex flex-col gap-5 border-t border-line pt-6 lg:w-[260px] lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            {gig.venue && (
              <div>
                <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Where
                </div>
                <div className="text-[13px] leading-[1.45] text-ink-soft">
                  {gig.venue.addressL1 && (
                    <>
                      {gig.venue.addressL1}
                      <br />
                    </>
                  )}
                  {gig.venue.city && gig.venue.state && (
                    <>
                      {gig.venue.city}, {gig.venue.state}{" "}
                      {gig.venue.postalCode}
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
                      className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                    >
                      Open in Maps →
                    </a>
                  ) : null;
                })()}
              </div>
            )}
            <div>
              <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                Net to you
              </div>
              <a
                href="#payout"
                className="font-serif text-[26px] font-light tabular-nums text-accent hover:underline"
              >
                {formatMoneyCents(net)}
              </a>
              <div className="mt-0.5 text-[11px] text-ink-mute">
                {formatMoneyCents(gig.clientPayCents)} in ·{" "}
                {formatMoneyCents(bandPayCents)} to the band
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone 1 · Advance ─────────────────────────────────────────
          Everything you do between "they called" and "we're playing":
          book the chairs, paper the deal. Personnel leads because it
          is the one thing on this page you touch on every single gig,
          and it finally gets the full width its row grid needs. */}
      <Zone
        step="Advance"
        title="Book the band, paper the deal"
        blurb="Who's playing and what's signed."
      >
        <div className="mb-4 max-w-[920px] rounded-[10px] border border-line bg-paper px-5 py-[18px] shadow-[0_1px_2px_rgb(14_12_9_/_0.03)]">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <h5 className="font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
              Personnel &middot; {gig.personnel.length} on
              {doNotEmailCount > 0 && (
                <span
                  className="ml-1.5 font-sans font-medium normal-case tracking-normal text-ink-soft"
                  title="These people are skipped by Send update, gig invites, and guest notices for this gig."
                >
                  &middot; {doNotEmailCount} not contacted
                </span>
              )}
            </h5>
            {/* Column headers for the two per-row checkboxes. Hidden
                when nobody is on the gig yet — headers over an empty
                list are just noise on a brand-new gig.

                Both carry a short form on phones: the full wording is
                four words, and in a 52px column that is literally one
                word per line, so the long label waits for sm+ and the
                tooltip carries the full sentence at every width. */}
            <div
              className={`items-end gap-2.5 ${
                gig.personnel.length === 0 ? "hidden" : "flex"
              }`}
            >
              <h5
                className="max-w-[150px] text-right text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.16em] text-ink-mute"
                title="When checked, this person's name and contact info appear in the Lineup section of emails to the rest of the band."
              >
                <span className="sm:hidden">In email</span>
                <span className="hidden sm:inline">Show in email lineup</span>
              </h5>
              <h5
                className="w-[52px] text-center text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.16em] text-accent"
                title="When checked, this person gets NO email and NO text about this gig — no gig alerts, updates, or invites."
              >
                <span className="sm:hidden">No contact</span>
                <span className="hidden sm:inline">Do not email or text</span>
              </h5>
            </div>
          </div>

          {/* Apply a lineup — the one control that turns roles, call
              order and lineups into a booked band. Picking one seats
              every chair from its call list in call order, prices each
              row, and (on a gig with no price yet) sets what the client
              pays. Anyone already here keeps their seat. */}
          {lineups.length > 0 && (
            <form
              action={applyLineupToGig.bind(null, gig.id)}
              className="mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-paper-warm/50 px-3 py-2"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                Apply lineup
              </span>
              <AutoSubmitSelect
                name="lineupId"
                placeholder={
                  gig.personnel.length === 0
                    ? "Seat the band…"
                    : "Add a lineup…"
                }
                className="input py-1 text-[11px]"
                options={lineups.map((l) => {
                  const chairs = l.roles.reduce((n, r) => n + r.count, 0);
                  const bits = [l.sizeLabel, `${chairs} chairs`].filter(
                    Boolean,
                  );
                  return {
                    value: l.id,
                    label: `${l.name} · ${bits.join(" · ")}`,
                  };
                })}
              />
              <span className="text-[11px] text-ink-mute">
                Fills from each role&rsquo;s call list, first call first.
              </span>
            </form>
          )}

          {/* Picked the wrong one? Take it back off. Only the rows that
              apply created go, nobody already paid goes, and the client
              price comes back only if that apply is still the reason
              it's set. See removeAppliedLineup. */}
          {appliedLineup && (
            <RemoveLineupButton
              gigId={gig.id}
              lineupName={appliedLineup.lineupName}
              playerCount={appliedLineup.playerCount}
            />
          )}

          {gig.personnel.length === 0 ? (
            <p className="text-[12.5px] italic text-ink-mute">
              Nobody on this gig yet.{" "}
              {lineups.length > 0
                ? "Apply a lineup above to seat the whole band at once."
                : "Add people from the payout worksheet below, or build a lineup on your Band page."}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {gig.personnel.map((p) => {
                const conflicts = conflictsByMusicianId.get(p.musicianId);
                return (
                  <div key={p.id} className="flex flex-col gap-1">
                    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_18px_52px] items-center gap-2.5">
                      {/* Avatar + name + meta are a Link to the musician's
                          edit page so the bandleader can jump to their
                          profile directly from any gig sheet. The toggles
                          stay outside the Link to avoid nesting
                          interactive elements. */}
                      <Link
                        href={`/roster/${p.musicianId}/edit`}
                        className="contents"
                      >
                        <Avatar
                          initials={
                            p.musician.initials ??
                            p.musician.name.slice(0, 2).toUpperCase()
                          }
                          leader={p.musician.isLeader}
                          avatarUrl={p.musician.avatarUrl}
                          name={p.musician.name}
                        />
                        <div className="-mx-1.5 rounded-md px-1.5 py-1 hover:bg-paper-warm/70">
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <div className="font-serif text-[14px] font-medium decoration-accent/40 underline-offset-4 hover:text-accent hover:underline">
                              {p.musician.name}
                            </div>
                          </div>
                          <div className="text-[11px] text-ink-mute">
                            {p.musician.isLeader ? "Leader · " : ""}
                            {roleNamesBesidesLeader(p.musician).join(", ")}
                            {p.musician.paymentMethod &&
                              !p.musician.isLeader && (
                                <span className="text-ink-soft">
                                  {" · "}
                                  {paymentMethodLabel(p.musician.paymentMethod)}
                                </span>
                              )}
                          </div>
                        </div>
                      </Link>
                      {/* Signed-in chip — only renders once the musician
                          has actually logged in, so the column stays
                          quiet for everyone else. */}
                      {p.musician.userId ? (
                        <span
                          title="Signed in — this musician has logged in and set up their profile."
                          className="inline-flex h-5 items-center gap-1 rounded-full bg-success px-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-paper"
                        >
                          <span className="text-[10px] leading-none">✓</span>
                          Joined
                        </span>
                      ) : (
                        <div />
                      )}
                      <LineupToggle
                        gigId={gig.id}
                        personnelId={p.id}
                        initial={p.includeInLineup}
                        musicianName={p.musician.name}
                      />
                      {/* Do not email — far-right column, centered under
                          its eyebrow. Leader row gets a blank cell: the
                          leader never receives the band fanout anyway. */}
                      {p.musician.isLeader ? (
                        <div />
                      ) : (
                        <div className="flex justify-center">
                          <DoNotEmailToggle
                            gigId={gig.id}
                            personnelId={p.id}
                            initial={p.doNotEmail}
                            musicianName={p.musician.name}
                          />
                        </div>
                      )}
                    </div>
                    {/* Conflict warning — soft yellow, aligned under the
                        name rather than the avatar. Doesn't block, just
                        informs, and each conflicting gig is a link so the
                        double-book is one hop from being resolved. */}
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
          )}

          {/* Pay lives in one place — the worksheet. This line is the
              bridge, so the two lists stop competing to be the money
              list and nobody has to reconcile them by eye. */}
          {sideCount > 0 && (
            <div className="mt-3.5 border-t border-line pt-3 text-[11.5px] text-ink-mute">
              <a href="#payout" className="text-accent hover:underline">
                {formatMoneyCents(bandPayCents)} to the band
              </a>{" "}
              · {paidCount} of {sideCount} paid · set every rate on the payout
              worksheet
            </div>
          )}
        </div>

        <PanelGrid panels={advancePanels} />
      </Zone>

      {/* ── Zone 2 · On the day ──────────────────────────────────────
          What the band needs in hand when they walk in the door.
          Everything here surfaces on the public sheet, the print
          sheet, the musician portal and the email fanout. */}
      <Zone
        step="On the day"
        title="What the band needs on site"
        blurb="Everything here reaches the band."
      >
        <PanelGrid panels={dayPanels} />
      </Zone>

      {/* ── Zone 3 · Settle up ───────────────────────────────────────
          After the downbeat: pay everyone, log the expenses, push to
          the books. The worksheet gets the full page width it always
          needed. */}
      <Zone
        step="Settle up"
        title="Pay the band, close the books"
        blurb="Rates, expenses, who's been paid."
      >
        <div id="payout" className="scroll-mt-4">
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
              // Passed through so the worksheet can show inline
              // Send-invite links on musicians who have an email but
              // haven't been invited yet — surfacing the "pay this
              // person but they haven't set a method" workflow at the
              // moment of action.
              email: p.musician.email ?? null,
              invitedAt: p.musician.invitedAt ?? null,
              // Per-gig Accept/Decline invite state.
              gigInvitedAt: p.invitedAt ?? null,
              gigInviteResponse: p.response ?? null,
              gigInviteRespondedAt: p.respondedAt ?? null,
              emailOpenedAt: p.emailOpenedAt ?? null,
              emailClickedAt: p.emailClickedAt ?? null,
              // Per-gig "Do not email" flag — the worksheet's Invite
              // button stands down for these rows.
              doNotEmail: p.doNotEmail,
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

        {/* My Crew management lives alongside the worksheet rather than
            up in Personnel — this is where the bandleader is actually
            setting per-musician pay, so it's the right spot for "load /
            save this lineup as my default." Moved here 2026-08-06 per
            Patrick. */}
        <div className="mt-6 max-w-[880px]">
          <CrewControls
            gigId={gig.id}
            personnelCount={gig.personnel.length}
            currentCrewCount={currentCrewCount}
            hasNonLeaderPersonnel={sideCount > 0}
          />
        </div>

        {gig.activity.length > 0 && (
          <div className="mt-5 max-w-[880px]">
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
        )}
      </Zone>

      {/* ── Gig utilities ───────────────────────────────────────────
          Three cross-cutting actions that belong to no single zone.
          Full width and three-across, which is the fix for these
          cards wrapping one word per line inside a third-page
          column. */}
      <div className="border-b border-line bg-paper-warm/40 px-6 py-7 md:px-8">
        <h5 className="mb-3 font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
          Gig utilities
        </h5>
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href={`/gigs/${gig.id}/messages`}
            className="group flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper px-4 py-3 transition-colors hover:border-accent/40 hover:bg-paper"
          >
            <div className="flex flex-col gap-0.5">
              <div className="text-[12.5px] font-medium text-ink">
                Review past messages
              </div>
              <div className="text-[11px] leading-snug text-ink-mute">
                {fanoutCount === 0
                  ? "Nothing sent yet — every update lands here."
                  : `${fanoutCount} ${fanoutCount === 1 ? "message" : "messages"} sent · full audit trail`}
              </div>
            </div>
            <span className="shrink-0 font-serif text-[15px] text-ink-mute transition-colors group-hover:text-accent">
              →
            </span>
          </Link>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <div className="text-[12.5px] font-medium text-ink">
                Share gig sheet
              </div>
              <div className="text-[11px] leading-snug text-ink-mute">
                Public sheet link — text or email to the band.
              </div>
            </div>
            <ShareGigButton gigId={gig.id} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-paper px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <div className="text-[12.5px] font-medium text-ink">
                Clone this gig
              </div>
              <div className="text-[11px] leading-snug text-ink-mute">
                Pick a date — keeps the same venue, band, and clock times.
              </div>
            </div>
            <CloneGigButton
              gigId={gig.id}
              sourceStartAt={gig.startAt.toISOString().slice(0, 10)}
            />
          </div>
        </div>
      </div>

      <div className="px-7 py-5">
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

// A guest list is a textarea of one name per line. Split it the same way
// everywhere so the counts, the dupe index and the checkboxes can never
// disagree about what counts as a name.
function splitGuestList(raw: string | null): string[] {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

type Panel = {
  key: string;
  title: string;
  /** Does this section have anything in it yet? Empty ones collapse. */
  filled: boolean;
  node: React.ReactNode;
  /** Needs the full two columns (guest list, contract panel). */
  wide?: boolean;
};

// One stage of the gig's life. The step word carries the accent colour and
// the title sits at 19/21px — the middle rung of the page's type scale,
// between the 26/30px venue name and the 11.5px section eyebrows. That
// missing middle rung is what made the old page read as choppy: every
// heading was either very large or very small, so nothing grouped.
function Zone({
  step,
  title,
  blurb,
  children,
}: {
  step: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-6 py-8 md:px-8 md:py-10">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
          {step}
        </span>
        <h3 className="font-serif text-[19px] font-normal tracking-tight md:text-[21px]">
          {title}
        </h3>
        <span className="text-[12px] text-ink-mute">{blurb}</span>
      </div>
      {children}
    </section>
  );
}

// Filled panels render as cards; empty ones go into one drawer at the
// bottom of the zone. A gig with nothing but a venue and a date used to
// render twenty-two sections, eleven of them blank labels over blank
// inputs. Now it renders what you've actually filled in, and the rest is
// one line you can open.
function PanelGrid({ panels }: { panels: Panel[] }) {
  const filled = panels.filter((p) => p.filled);
  const empty = panels.filter((p) => !p.filled);
  return (
    <>
      {filled.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filled.map((p) => (
            <div key={p.key} className={p.wide ? "lg:col-span-2" : undefined}>
              <Section title={p.title}>{p.node}</Section>
            </div>
          ))}
        </div>
      )}
      {empty.length > 0 && (
        <details className="group mt-4 rounded-[10px] border border-dashed border-line-strong bg-paper-warm/30 open:bg-paper">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5">
            <span className="shrink-0 font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
              Add to this gig
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[11.5px] text-ink-mute"
              title={empty.map((p) => p.title).join(" · ")}
            >
              {empty.map((p) => p.title).join(" · ")}
            </span>
            <span className="shrink-0 font-serif text-[15px] text-ink-mute transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-5 border-t border-line px-5 py-5 lg:grid-cols-2">
            {empty.map((p) => (
              <div key={p.key} className={p.wide ? "lg:col-span-2" : undefined}>
                <h6 className="mb-2.5 font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
                  {p.title}
                </h6>
                {p.node}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Each section sits inside its own hairline-bordered card so the page
  // reads as a set of composed panels rather than a wall of loose text:
  // the faintest line token, a soft 10px radius, generous internal
  // padding, and a barely-there shadow for a whisper of lift off the
  // paper — the letterpress-menu feel, not a dashboard tile.
  return (
    <section className="h-full rounded-[10px] border border-line bg-paper px-5 py-[18px] shadow-[0_1px_2px_rgb(14_12_9_/_0.03)]">
      <h5 className="mb-3 font-serif text-[11.5px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
        {title}
      </h5>
      {children}
    </section>
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

function TimeTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div
        className={`font-serif text-[20px] font-normal tracking-tight ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] leading-[1.35] text-ink-soft">
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

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PayoutWorksheet } from "@/components/PayoutWorksheet";
import { InlineField } from "@/components/InlineField";
import { SetlistUpload } from "@/components/SetlistUpload";
import { PushToQboButton } from "@/components/PushToQboButton";
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
// "The Funky Biscuit · Gigwright".
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) return { title: "Gigwright" };
  const gig = await db.gig.findFirst({
    where: { id, ownerId: user.id },
    include: { venue: true },
  });
  const name = gig?.venue?.name ?? "Gig";
  return { title: `${name} · Gigwright` };
}

export default async function GigDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [gig, roster, qboConn] = await Promise.all([
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
  ]);

  if (!gig) notFound();

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
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-7 border-b border-line bg-paper-warm px-7 py-[22px]">
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
            <Link href="/dashboard" className="hover:text-ink">
              Gigs
            </Link>{" "}
            <span className="text-accent">·</span> {dow}
          </div>
          <h2 className="font-serif text-[30px] font-normal leading-[1.05] tracking-tight">
            {gig.venue?.name ?? "TBD"}
          </h2>
          <div className="mt-1 text-[12px] text-ink-soft">
            {gig.venue?.city && `${gig.venue.city}, ${gig.venue.state}`}{" "}
            <span className="mx-1.5 text-ink-mute">·</span>
            <StatusPill status={gig.status} />
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
          <button
            disabled
            className="cursor-not-allowed rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper opacity-50"
            title="Coming soon"
          >
            Send alert
          </button>
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-3">
        {/* Column 1: Personnel + Money */}
        <div className="border-r border-line px-6 py-5">
          <Section title={`Personnel · ${gig.personnel.length} on`}>
            <div className="flex flex-col gap-2.5">
              {gig.personnel.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-2.5"
                >
                  <Avatar
                    initials={p.musician.initials ?? p.musician.name.slice(0, 2).toUpperCase()}
                    leader={p.musician.isLeader}
                    avatarUrl={p.musician.avatarUrl}
                    name={p.musician.name}
                  />
                  <div>
                    <div className="font-serif text-[14px] font-medium">
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
                </div>
              ))}
            </div>
          </Section>

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

        {/* Column 2: Times + Venue + Tech */}
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
        </div>

        {/* Column 3: Gig Materials + Set List + Activity */}
        <div className="px-6 py-5">
          <Section title="Gig materials">
            <InlineField
              gigId={gig.id}
              field="materialsUrl"
              initialValue={gig.materialsUrl}
              placeholder="Paste link (Google Drive, Dropbox, OneDrive…)"
              displayAs="link"
            />
          </Section>

          <Section title="Set list">
            <SetlistUpload
              gigId={gig.id}
              initialUrl={gig.setlistUrl}
              initialFileName={gig.setlistFileName}
            />
            <div className="mt-2 text-[11px] leading-[1.4] text-ink-mute">
              If this changes you will all get a text and email.
            </div>
          </Section>

          <Section title="Calendar sync · pending">
            <div className="flex flex-wrap gap-1.5">
              {gig.personnel.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-[11px] text-ink-soft"
                >
                  <span className="h-1 w-1 rounded-full bg-line-strong" />
                  <em className="font-serif text-[12px] not-italic text-ink">
                    {p.musician.name.split(" ")[0]}
                  </em>
                  <span>
                    {calendarLabel(p.musician.calendarProvider)}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-2.5 border-t border-dashed border-line-strong pt-2.5 text-[11px] leading-[1.45] text-ink-mute">
              Two-way iCloud and Google calendar sync is Phase 1 work. The plumbing is there; the providers are next.
            </div>
          </Section>

          <Section title="Activity">
            {gig.activity.length === 0 ? (
              <div className="text-[12px] text-ink-mute">
                No activity yet.
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-[12px]">
                {gig.activity.map((a) => (
                  <div key={a.id}>
                    <span className="text-ink-mute">
                      {a.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      {a.createdAt.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    · {a.summary}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Notes — full width, click to edit */}
      <div className="border-t border-line bg-surface px-7 py-5">
        <h5 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          Notes
        </h5>
        <InlineField
          gigId={gig.id}
          field="notes"
          initialValue={gig.notes}
          multiline
          placeholder="Parking, green room, audience vibe, anything worth remembering…"
        />
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
          }))}
          expenses={gig.expenses.map((e) => ({
            id: e.id,
            label: e.label,
            amountCents: e.amountCents,
            position: e.position,
            paidAt: e.paidAt,
          }))}
          roster={roster.map((m) => ({
            id: m.id,
            name: m.name,
            paymentMethod: m.paymentMethod ?? null,
            payoutAddress: m.payoutAddress ?? null,
            isLeader: m.isLeader,
          }))}
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

function calendarLabel(c: string): string {
  if (c === "ICLOUD") return "iCloud";
  if (c === "GOOGLE") return "Google";
  if (c === "OUTLOOK") return "Outlook";
  return "No calendar";
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

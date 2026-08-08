import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { FREE_LIMITS, isPaid } from "@/lib/plan";

export default async function RosterPage() {
  const user = await requireUser();
  const musicians = await db.musician.findMany({
    where: { ownerId: user.id },
    orderBy: [{ isLeader: "desc" }, { name: "asc" }],
  });
  // Signed-in counter so the roster header can show how many
  // musicians have actually responded to their invite. userId gets
  // set on a Musician row the moment they sign in with their email,
  // so it's the cleanest "they're on the system" signal.
  const respondedCount = musicians.filter((m) => m.userId).length;

  const paid = isPaid(user.plan);
  const atCap = !paid && musicians.length >= FREE_LIMITS.musicians;
  const nearCap = !paid && musicians.length >= FREE_LIMITS.musicians - 2;

  return (
    <div className="-mx-8 -mb-9 -mt-7">
      <div className="flex items-center gap-2 border-b border-line bg-paper-warm px-6 py-4">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">Roster</h4>
        <span className="text-[12px] text-ink-mute">
          · {musicians.length}
          {!paid && ` / ${FREE_LIMITS.musicians}`} members
        </span>
        {respondedCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {respondedCount} signed in
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            disabled
            className="cursor-not-allowed rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink opacity-50"
          >
            Import CSV
          </button>
          {atCap ? (
            <Link
              href="/settings/billing?upgrade=musicians"
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-[#611B11]"
            >
              Upgrade to add more
            </Link>
          ) : (
            <Link
              href="/roster/new"
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-black"
            >
              + New member
            </Link>
          )}
        </div>
      </div>

      {(atCap || nearCap) && (
        <div className="px-6 pt-4">
          <UpgradeBanner
            reason="musicians"
            message={
              atCap
                ? `You're at the Free plan limit of ${FREE_LIMITS.musicians} musicians. Upgrade for unlimited roster.`
                : `${musicians.length} of ${FREE_LIMITS.musicians} musicians used on Free. Upgrade for unlimited.`
            }
          />
        </div>
      )}

      {musicians.length === 0 ? (
        <div className="py-20 text-center text-[13px] text-ink-mute">
          No roster yet.{" "}
          <Link href="/roster/new" className="text-accent hover:underline">
            Add your first musician
          </Link>
          .
        </div>
      ) : (
        <>
          {/* Roster splits into two sections when any producers exist:
              musicians on top, producers underneath in their own group
              with an accent header. Patrick's design 2026-08-08: the
              PRODUCER role tag doubles as visual grouping so he can
              scan his client-side contacts at a glance without a
              separate nav item. If no one is tagged PRODUCER yet, we
              render the flat list unchanged. */}
          {(() => {
            const isProducer = (m: { roles: string[] }) =>
              m.roles.some((r) => r.toUpperCase() === "PRODUCER");
            const producers = musicians.filter(isProducer);
            const players = musicians.filter((m) => !isProducer(m));

            return (
              <>
                <div className="grid grid-cols-2 gap-px bg-line">
                  {players.map((m) => (
                    <MusicianRow key={m.id} m={m} />
                  ))}
                  {players.length % 2 === 1 && <div className="bg-surface" />}
                </div>
                {producers.length > 0 && (
                  <>
                    <div className="mt-6 flex items-baseline gap-2 border-b border-line bg-paper-warm/60 px-6 py-3">
                      <h4 className="font-serif text-[16px] font-normal tracking-tight">
                        <em className="not-italic text-accent">Producers</em>
                      </h4>
                      <span className="text-[11px] text-ink-mute">
                        · {producers.length} · client-side contacts
                        (invisible to musicians)
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-line">
                      {producers.map((m) => (
                        <MusicianRow key={m.id} m={m} />
                      ))}
                      {producers.length % 2 === 1 && (
                        <div className="bg-surface" />
                      )}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

function MusicianRow({
  m,
}: {
  m: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    initials: string | null;
    avatarUrl: string | null;
    roles: string[];
    isLeader: boolean;
    calendarProvider: string;
    paymentMethod: string | null;
    invitedAt: Date | null;
    userId: string | null;
  };
}) {
  const hasSignedIn = !!m.userId;
  const isInvited = !!m.invitedAt && !hasSignedIn;
  const initials =
    m.initials ?? m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    // The entire row is the click target — no separate "Open" button. The
    // row was previously a non-link wrapper with an Open button on the
    // right that kept getting visually clipped by long emails / variable
    // column widths. Making the whole row a Link removes the failure mode
    // entirely: every pixel of the row navigates to the edit page.
    <Link
      href={`/roster/${m.id}/edit`}
      className="group flex items-center gap-3.5 bg-surface px-6 py-3.5 transition-colors hover:bg-paper-warm/60"
    >
      {/* Avatar with a small green corner check when the musician has
          signed in — instantly readable status without the name
          having to compete with a badge. */}
      <div className="relative shrink-0">
        <div
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold ${
            m.isLeader ? "bg-accent text-paper" : "bg-paper-deep text-ink-soft"
          }`}
        >
          {m.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={m.avatarUrl}
              alt={m.name}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        {hasSignedIn && (
          <span
            title="Signed in — this musician has logged in and can set their own profile"
            className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-success text-[9px] font-bold leading-none text-paper"
          >
            ✓
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="truncate font-serif text-[17px] font-medium tracking-tight">
            {m.name}
          </div>
          {hasSignedIn ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-success">
              Signed in
            </span>
          ) : isInvited ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper-warm px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Invited
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-mute">
          {m.roles.map((r) => (
            <span
              key={r}
              className="rounded-full border border-line-strong px-[7px] py-px font-medium"
            >
              {r}
            </span>
          ))}
        </div>
      </div>
      <div className="hidden min-w-0 max-w-[200px] shrink text-right text-[11px] leading-[1.45] text-ink-soft 2xl:block">
        {m.email && (
          <div className="truncate">
            <span className="mr-1 text-[9px] uppercase tracking-[0.08em] text-ink-mute">
              EMAIL
            </span>
            {m.email}
          </div>
        )}
        <div className="truncate">
          <span className="mr-1 text-[9px] uppercase tracking-[0.08em] text-ink-mute">
            PH
          </span>
          {m.phone ?? "—"}
        </div>
      </div>
      <div className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute xl:block">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
        {calendarLabel(m.calendarProvider)}
      </div>
      <div className="hidden min-w-[75px] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute xl:block">
        {m.paymentMethod ? (
          <>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            {paymentLabel(m.paymentMethod)}
          </>
        ) : (
          <span className="font-normal text-ink-mute">—</span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center whitespace-nowrap">
        <span className="text-[14px] text-ink-mute transition-colors group-hover:text-accent">
          →
        </span>
      </div>
    </Link>
  );
}

function calendarLabel(c: string): string {
  if (c === "ICLOUD") return "iCloud";
  if (c === "GOOGLE") return "Google";
  if (c === "OUTLOOK") return "Outlook";
  return "—";
}

function paymentLabel(m: string): string {
  const map: Record<string, string> = {
    VENMO: "Venmo",
    PAYPAL: "PayPal",
    ZELLE: "Zelle",
    CASHAPP: "Cash App",
    CASH: "Cash",
    CHECK: "Check",
    DIRECT_DEPOSIT: "Dir Dep",
    OTHER: "Other",
  };
  return map[m] ?? m;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

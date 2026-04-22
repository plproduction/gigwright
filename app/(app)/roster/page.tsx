import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function RosterPage() {
  const user = await requireUser();
  const musicians = await db.musician.findMany({
    where: { ownerId: user.id },
    orderBy: [{ isLeader: "desc" }, { name: "asc" }],
  });

  return (
    <div className="-mx-8 -mb-9 -mt-7">
      <div className="flex items-center gap-2 border-b border-line bg-paper-warm px-6 py-4">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">Roster</h4>
        <span className="text-[12px] text-ink-mute">· {musicians.length} members</span>
        <div className="ml-auto flex gap-2">
          <button
            disabled
            className="cursor-not-allowed rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink opacity-50"
          >
            Import CSV
          </button>
          <Link
            href="/roster/new"
            className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-black"
          >
            + New member
          </Link>
        </div>
      </div>

      {musicians.length === 0 ? (
        <div className="py-20 text-center text-[13px] text-ink-mute">
          No roster yet.{" "}
          <Link href="/roster/new" className="text-accent hover:underline">
            Add your first musician
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-line">
          {musicians.map((m) => (
            <MusicianRow key={m.id} m={m} />
          ))}
          {/* If odd count, add an empty cell so the last row still has a right border */}
          {musicians.length % 2 === 1 && <div className="bg-surface" />}
        </div>
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
    w9Received: boolean;
  };
}) {
  const initials =
    m.initials ?? m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="group grid grid-cols-[36px_1fr_auto_auto_auto_auto] items-center gap-3.5 bg-surface px-6 py-3.5 transition-colors hover:bg-paper-warm/50">
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
      <div>
        <div className="font-serif text-[17px] font-medium tracking-tight select-text">
          {m.name}
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
      <div className="text-right text-[11px] leading-[1.45] text-ink-soft select-text">
        {m.email && (
          <>
            <span className="mr-1 text-[9px] uppercase tracking-[0.08em] text-ink-mute">
              EMAIL
            </span>
            {m.email}
            <br />
          </>
        )}
        <span className="mr-1 text-[9px] uppercase tracking-[0.08em] text-ink-mute">
          PH
        </span>
        {m.phone ? (
          <span>{m.phone}</span>
        ) : (
          <span>—</span>
        )}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
        {calendarLabel(m.calendarProvider)}
      </div>
      <div className="min-w-[75px] text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {m.paymentMethod ? (
          <>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            {paymentLabel(m.paymentMethod)}
          </>
        ) : (
          <span className="font-normal text-ink-mute">—</span>
        )}
      </div>
      <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
            m.w9Received
              ? "border-success/30 bg-success/10 text-success"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
          title={m.w9Received ? "W-9 received" : "W-9 not received — band will see a reminder on outbound messages"}
        >
          {m.w9Received ? "W-9 ✓" : "W-9"}
        </span>
        <Link
          href={`/roster/${m.id}/edit`}
          className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink hover:border-accent hover:bg-accent hover:text-paper"
        >
          Open
        </Link>
      </div>
    </div>
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

import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// Finance hub: year-end exports + a breakdown of expenses by tax kind.
// Per-gig finance (client pay, payouts, expenses) still lives on each
// gig's Payout Worksheet — this page is for the tax-season view.
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();

  const sp = await searchParams;
  const year = sp.year
    ? Number.parseInt(sp.year, 10)
    : new Date().getFullYear();
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

  // Summary: expenses grouped by kind for the year
  const grouped = await db.gigExpense.groupBy({
    by: ["kind"],
    where: { gig: { ownerId: user.id, startAt: { gte: start, lt: end } } },
    _sum: { amountCents: true, miles: true, days: true },
    _count: { _all: true },
  });

  // Paid-out totals to musicians in the year
  const paid = await db.gigPersonnel.aggregate({
    where: {
      paidAt: { not: null },
      gig: { ownerId: user.id, startAt: { gte: start, lt: end } },
    },
    _sum: { payCents: true },
    _count: { _all: true },
  });

  // Client revenue (sum of clientPayCents for gigs in year)
  const revenue = await db.gig.aggregate({
    where: {
      ownerId: user.id,
      startAt: { gte: start, lt: end },
      clientPayCents: { not: null },
    },
    _sum: { clientPayCents: true },
    _count: { _all: true },
  });

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  const totalExpenseCents = grouped.reduce(
    (s, g) => s + (g._sum.amountCents ?? 0),
    0,
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Finance
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
            Tax year
          </span>
          <div className="flex gap-1 rounded-md border border-line bg-paper p-0.5">
            {years.map((y) => (
              <Link
                key={y}
                href={`/finance?year=${y}`}
                prefetch={false}
                className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                  y === year
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-paper-warm"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Top-level year summary */}
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Gross revenue"
          value={formatMoney(revenue._sum.clientPayCents ?? 0)}
          sub={`${revenue._count._all} gigs`}
        />
        <Stat
          label="Musician pay (paid)"
          value={formatMoney(paid._sum.payCents ?? 0)}
          sub={`${paid._count._all} payouts`}
        />
        <Stat
          label="Expenses"
          value={formatMoney(totalExpenseCents)}
          sub={`${grouped.reduce((s, g) => s + g._count._all, 0)} rows`}
        />
        <Stat
          label="Net"
          value={formatMoney(
            (revenue._sum.clientPayCents ?? 0) -
              (paid._sum.payCents ?? 0) -
              totalExpenseCents,
          )}
          sub={`before tax`}
          emphasize
        />
      </section>

      {/* Expense breakdown by kind */}
      <section className="mb-10 rounded-[10px] border border-line bg-surface">
        <header className="border-b border-line px-5 py-3">
          <h5 className="font-serif text-[16px] font-normal">
            Expenses by tax category
          </h5>
        </header>
        {grouped.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-ink-mute">
            No expenses recorded for {year}.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {KIND_ORDER.map((kind) => {
              const g = grouped.find((x) => x.kind === kind);
              if (!g || !g._sum.amountCents) return null;
              return (
                <div
                  key={kind}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2.5"
                >
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      backgroundColor: KIND_TONE[kind].bg,
                      color: KIND_TONE[kind].fg,
                    }}
                  >
                    {KIND_LABEL[kind]}
                  </span>
                  <span className="text-[13px] text-ink-soft">
                    {g._count._all} row{g._count._all === 1 ? "" : "s"}
                    {kind === "MILEAGE" && g._sum.miles != null && (
                      <> · {g._sum.miles.toLocaleString("en-US")} miles</>
                    )}
                    {kind === "PER_DIEM" && g._sum.days != null && (
                      <> · {g._sum.days} days</>
                    )}
                  </span>
                  <span className="font-serif text-[15px] tabular-nums text-ink">
                    {formatMoney(g._sum.amountCents ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Exports */}
      <section className="mb-10 rounded-[10px] border border-line bg-paper-warm p-5">
        <h5 className="mb-1 font-serif text-[16px] font-normal">
          Download for your accountant
        </h5>
        <p className="mb-4 max-w-[520px] text-[13px] leading-[1.5] text-ink-soft">
          Year-end CSV exports ready for Schedule C and 1099-NEC prep.
          Expenses are grouped by tax kind; 1099 summary flags anyone you
          paid $600 or more.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <a
            href={`/api/export/expenses?year=${year}`}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12.5px] font-semibold text-paper transition-colors hover:bg-black"
          >
            <span>Expenses CSV</span>
            <span className="text-[11px] opacity-70">{year}</span>
          </a>
          <a
            href={`/api/export/1099?year=${year}`}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>1099 summary CSV</span>
            <span className="text-[11px] opacity-80">{year}</span>
          </a>
        </div>
      </section>

      <p className="text-center text-[12px] text-ink-mute">
        Per-gig finance (client pay, per-musician pay, expenses) still lives on
        each gig&rsquo;s payout worksheet.
        <br />
        <Link href="/dashboard" className="text-accent hover:underline">
          Back to gigs →
        </Link>
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div
        className={`mt-2 font-serif tabular-nums ${
          emphasize
            ? "text-[26px] font-light text-accent"
            : "text-[22px] font-light text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink-mute">{sub}</div>
    </div>
  );
}

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  const neg = dollars < 0;
  const abs = Math.abs(dollars);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return neg ? `($${formatted})` : `$${formatted}`;
}

const KIND_ORDER = [
  "GENERAL",
  "MILEAGE",
  "PER_DIEM",
  "MEAL",
  "LODGING",
  "TRAVEL",
] as const;

const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = {
  GENERAL: "General",
  MILEAGE: "Mileage",
  PER_DIEM: "Per-diem",
  MEAL: "Meals & ent.",
  LODGING: "Lodging",
  TRAVEL: "Travel",
};

const KIND_TONE: Record<
  (typeof KIND_ORDER)[number],
  { bg: string; fg: string }
> = {
  GENERAL: { bg: "#EDE7DA", fg: "#494336" },
  MILEAGE: { bg: "#F4E1DB", fg: "#7E2418" },
  PER_DIEM: { bg: "#E3DDD1", fg: "#494336" },
  MEAL: { bg: "#F4E1DB", fg: "#7E2418" },
  LODGING: { bg: "#E3DDD1", fg: "#494336" },
  TRAVEL: { bg: "#E3DDD1", fg: "#494336" },
};

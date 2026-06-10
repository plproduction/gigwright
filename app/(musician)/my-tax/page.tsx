import Link from "next/link";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import { formatLongDate, gigVenueLabel } from "@/lib/format";
import { STANDARD_MILEAGE_RATE_USD } from "@/lib/actions/my-mileage";

// Year-end tax summary for the working musician — every gig they've
// logged miles for in the current calendar year, with the IRS standard
// mileage deduction pre-computed. CSV download lives at /my-tax.csv so
// they can hand it straight to their accountant.
//
// Pay totals are intentionally NOT shown here. Pay is paid through the
// bandleader (each leader handles their own 1099-NEC); the musician's
// own tax-prep tool job is to track DEDUCTIONS, not income. Combining
// the two would tempt double-counting.
export default async function MyTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireMusician();
  const sp = await searchParams;

  const myMusicians = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicians.map((m) => m.id);

  const now = new Date();
  const currentYear = now.getFullYear();
  const year = sp.year ? Number(sp.year) : currentYear;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Earliest year we have data for — used to render a year selector.
  // If the musician has never logged miles, this still renders an
  // empty current year cleanly.
  const oldestMileage = await db.musicianGigMileage.findFirst({
    where: { musicianId: { in: myIds } },
    orderBy: { gig: { startAt: "asc" } },
    select: { gig: { select: { startAt: true } } },
  });
  const earliestYear = oldestMileage?.gig.startAt.getFullYear() ?? currentYear;
  const yearOptions: number[] = [];
  for (let y = currentYear; y >= earliestYear; y--) yearOptions.push(y);

  const rows = await db.musicianGigMileage.findMany({
    where: {
      musicianId: { in: myIds },
      gig: { startAt: { gte: yearStart, lt: yearEnd } },
    },
    include: {
      gig: {
        include: {
          venue: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { gig: { startAt: "asc" } },
  });

  const totalMiles = rows.reduce((sum, r) => sum + r.miles, 0);
  const totalDeductible = totalMiles * STANDARD_MILEAGE_RATE_USD;

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <div>
          <h4 className="font-serif text-[22px] font-normal tracking-tight">
            My tax summary
          </h4>
          <p className="mt-1 text-[12px] text-ink-mute">
            Per-gig mileage at the IRS standard rate. Hand this to your
            accountant or paste it into your 1099 worksheet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {yearOptions.length > 1 && (
            <form className="flex items-center gap-1.5 text-[11px] text-ink-mute">
              <label>Year:</label>
              <select
                name="year"
                defaultValue={String(year)}
                className="rounded border border-line bg-paper px-2 py-1 text-[12px]"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium hover:border-accent hover:text-accent"
              >
                Go
              </button>
            </form>
          )}
          <Link
            href={`/my-tax.csv?year=${year}`}
            className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-black"
          >
            Download CSV
          </Link>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label={`${year} miles logged`} value={totalMiles.toLocaleString()} unit="mi" />
        <Tile
          label="Deductible value"
          value={`$${totalDeductible.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          unit={`at $${STANDARD_MILEAGE_RATE_USD.toFixed(2)}/mi`}
        />
        <Tile label={`${year} gigs with mileage`} value={String(rows.length)} unit="gigs" />
      </div>

      {/* Per-gig table */}
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-paper-warm/40 py-10 text-center text-[13px] text-ink-mute">
          No mileage logged for {year} yet.{" "}
          <Link href="/my-gigs" className="text-accent underline-offset-4 hover:underline">
            Go log miles per gig →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-paper-warm">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Venue / event</th>
                <th className="px-4 py-2 text-left">Bandleader</th>
                <th className="px-4 py-2 text-right">Miles</th>
                <th className="px-4 py-2 text-right">Deductible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const venue = gigVenueLabel(r.gig.venue);
                const deductible = r.miles * STANDARD_MILEAGE_RATE_USD;
                return (
                  <tr key={r.id} className="hover:bg-paper-warm/40">
                    <td className="px-4 py-2 font-serif tabular-nums">
                      {formatLongDate(r.gig.startAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-serif">{venue.name}</div>
                      {r.gig.eventName && (
                        <div className="text-[11px] italic text-accent">
                          {r.gig.eventName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-soft">
                      {r.gig.owner?.name ??
                        r.gig.owner?.email?.split("@")[0] ??
                        "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-serif tabular-nums">
                      {r.miles.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-serif tabular-nums">
                      ${deductible.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-paper-warm">
              <tr className="text-[12px] font-semibold">
                <td className="px-4 py-2" colSpan={3}>
                  Total {year}
                </td>
                <td className="px-4 py-2 text-right font-serif tabular-nums">
                  {totalMiles.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right font-serif tabular-nums">
                  $
                  {totalDeductible.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-ink-mute">
        The IRS standard mileage rate covers fuel, insurance, depreciation,
        maintenance, and tires for vehicles used in your work as a
        contractor. Track your actual odometer log separately — GigWright
        just sums what you enter here. Not tax advice. Consult your CPA.
      </p>
    </>
  );
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-paper p-[16px_18px]">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
        {label}
      </div>
      <div className="font-serif text-[26px] font-light leading-none tracking-tight tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-[12px] font-normal text-ink-mute">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

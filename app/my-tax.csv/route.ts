import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMusician } from "@/lib/session";
import { STANDARD_MILEAGE_RATE_USD } from "@/lib/actions/my-mileage";

// GET /my-tax.csv?year=2026
// Year-end mileage CSV for the signed-in musician. One row per gig with
// logged mileage, plus a totals row at the bottom. Designed to drop
// straight into an accountant's spreadsheet — columns ordered the way a
// CPA scans (Date · Venue · Bandleader · Miles · Rate · Deductible).
//
// Pay totals are intentionally absent; this CSV is a DEDUCTION worksheet,
// not an income summary. The bandleader's 1099-NEC covers income.
export async function GET(req: Request) {
  const user = await requireMusician();

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const myMusicians = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicians.map((m) => m.id);

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

  const lines: string[] = [];
  lines.push("Date,Venue,Event,Bandleader,Miles,Rate (USD/mi),Deductible (USD)");

  let totalMiles = 0;
  for (const r of rows) {
    const date = r.gig.startAt.toISOString().slice(0, 10);
    const venue = r.gig.venue?.name ?? "—";
    const event = r.gig.eventName ?? "";
    const leader =
      r.gig.owner?.name ?? r.gig.owner?.email?.split("@")[0] ?? "—";
    const deductible = (r.miles * STANDARD_MILEAGE_RATE_USD).toFixed(2);
    totalMiles += r.miles;
    lines.push(
      [
        date,
        csvField(venue),
        csvField(event),
        csvField(leader),
        r.miles,
        STANDARD_MILEAGE_RATE_USD.toFixed(2),
        deductible,
      ].join(","),
    );
  }

  // Totals row — sums match what the on-screen footer shows.
  const totalDeductible = (totalMiles * STANDARD_MILEAGE_RATE_USD).toFixed(2);
  lines.push(`Total ${year},,,,${totalMiles},,${totalDeductible}`);

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gigwright-mileage-${year}.csv"`,
    },
  });
}

// CSV field escaping — wrap in quotes if the field contains commas,
// quotes, or newlines. Standard RFC 4180.
function csvField(value: string): string {
  if (value === "") return "";
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/export/expenses?year=2026
// Returns a CSV of every expense row on every gig this user owns, in the
// given year (defaults to current year). Rows are sorted by gig date then
// position within the gig. Useful as a Schedule C prep sheet.
//
// Columns: Date, Venue, Gig ID, Kind, Label, Amount (USD),
//          Miles (if MILEAGE), Days (if PER_DIEM), Paid Date
//
// Year is based on gig.startAt (the gig date), not the expense createdAt,
// because that's the natural unit for tax reporting ("expenses incurred
// on this gig").
export async function GET(req: Request) {
  const user = await requireUser();

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const year = yearStr
    ? Number.parseInt(yearStr, 10)
    : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }

  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

  const expenses = await db.gigExpense.findMany({
    where: {
      gig: { ownerId: user.id, startAt: { gte: start, lt: end } },
    },
    include: {
      gig: {
        select: {
          id: true,
          startAt: true,
          venue: { select: { name: true } },
        },
      },
    },
    orderBy: [{ gig: { startAt: "asc" } }, { position: "asc" }],
  });

  const header = [
    "Date",
    "Venue",
    "Gig ID",
    "Kind",
    "Label",
    "Amount (USD)",
    "Miles",
    "Days",
    "Paid Date",
  ];

  const rows = expenses.map((e) => [
    e.gig.startAt.toISOString().slice(0, 10),
    e.gig.venue?.name ?? "",
    e.gig.id,
    e.kind,
    e.label,
    (e.amountCents / 100).toFixed(2),
    e.miles != null ? String(e.miles) : "",
    e.days != null ? String(e.days) : "",
    e.paidAt ? e.paidAt.toISOString().slice(0, 10) : "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gigwright-expenses-${year}.csv"`,
    },
  });
}

// RFC 4180 CSV quoting: wrap in double quotes if the field contains
// comma, newline, carriage return, or double quote; inner double quotes
// get doubled.
function csvField(v: string): string {
  const s = v ?? "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

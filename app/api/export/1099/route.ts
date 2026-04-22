import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/export/1099?year=2026
// Returns a CSV of total paid per musician for the given year. Only counts
// GigPersonnel rows where paidAt is set (i.e. actually paid out). Year is
// based on the gig's startAt. This is the raw data for 1099-NEC filings —
// a musician gets a 1099-NEC if you paid them $600+ in the year.
//
// Columns: Musician, Email, Phone, Total Paid (USD), Gigs Paid,
//          1099 Threshold Met?, Payout Address, Payment Method, W-9 on File?
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

  // Pull every paid GigPersonnel row in the year, grouped by musician.
  const paid = await db.gigPersonnel.findMany({
    where: {
      paidAt: { not: null },
      gig: { ownerId: user.id, startAt: { gte: start, lt: end } },
    },
    select: {
      musicianId: true,
      payCents: true,
      musician: {
        select: {
          name: true,
          email: true,
          phone: true,
          payoutAddress: true,
          paymentMethod: true,
          w9Received: true,
        },
      },
    },
  });

  // Aggregate by musician
  const byMusician = new Map<
    string,
    {
      name: string;
      email: string | null;
      phone: string | null;
      payoutAddress: string | null;
      paymentMethod: string | null;
      w9Received: boolean;
      totalCents: number;
      gigCount: number;
    }
  >();
  for (const p of paid) {
    const existing = byMusician.get(p.musicianId);
    if (existing) {
      existing.totalCents += p.payCents;
      existing.gigCount += 1;
    } else {
      byMusician.set(p.musicianId, {
        name: p.musician.name,
        email: p.musician.email ?? null,
        phone: p.musician.phone ?? null,
        payoutAddress: p.musician.payoutAddress ?? null,
        paymentMethod: p.musician.paymentMethod ?? null,
        w9Received: p.musician.w9Received,
        totalCents: p.payCents,
        gigCount: 1,
      });
    }
  }

  // Sort by total paid, descending
  const rowsOut = [...byMusician.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );

  const header = [
    "Musician",
    "Email",
    "Phone",
    "Total Paid (USD)",
    "Gigs Paid",
    "1099 Threshold Met (≥$600)?",
    "Payout Address",
    "Payment Method",
    "W-9 on File?",
  ];
  const rows = rowsOut.map((r) => [
    r.name,
    r.email ?? "",
    r.phone ?? "",
    (r.totalCents / 100).toFixed(2),
    String(r.gigCount),
    r.totalCents >= 60000 ? "YES" : "no",
    r.payoutAddress ?? "",
    r.paymentMethod ?? "",
    r.w9Received ? "YES" : "no",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gigwright-1099-${year}.csv"`,
    },
  });
}

function csvField(v: string): string {
  const s = v ?? "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

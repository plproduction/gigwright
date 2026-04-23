import { NextResponse } from "next/server";
import { requireMusician } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/my/earnings?year=2026
// Musician-facing CSV: every paid gig in the year across every bandleader
// they work for. Useful at tax time when a 1099 doesn't show up and they
// need to reconcile.
export async function GET(req: Request) {
  const user = await requireMusician();

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

  const myMusicianRows = await db.musician.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const myIds = myMusicianRows.map((m) => m.id);

  const paid = await db.gigPersonnel.findMany({
    where: {
      musicianId: { in: myIds },
      paidAt: { not: null },
      gig: { startAt: { gte: start, lt: end } },
    },
    select: {
      payCents: true,
      paidAt: true,
      paidMethod: true,
      gig: {
        select: {
          startAt: true,
          venue: { select: { name: true } },
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  const header = [
    "Gig Date",
    "Venue",
    "Bandleader",
    "Bandleader Email",
    "Paid Date",
    "Amount (USD)",
    "Method",
  ];
  const rows = paid.map((p) => [
    p.gig.startAt.toISOString().slice(0, 10),
    p.gig.venue?.name ?? "",
    p.gig.owner?.name ?? "",
    p.gig.owner?.email ?? "",
    p.paidAt ? p.paidAt.toISOString().slice(0, 10) : "",
    (p.payCents / 100).toFixed(2),
    p.paidMethod ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gigwright-my-earnings-${year}.csv"`,
    },
  });
}

function csvField(v: string): string {
  const s = v ?? "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

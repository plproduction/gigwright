import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { upsertVendor, createBill } from "@/lib/qbo";

// POST /api/qbo/push-gig/[id]
// Batch-posts a bill per paid musician for this gig into QuickBooks.
// Rules:
//   • Gig must belong to the authenticated user.
//   • User must have a QBO connection + a default expense account set.
//   • Only paid personnel (paidAt != null) get a bill.
//   • Leaders never get a bill (it's you, not a contractor).
//   • Idempotent per row: if a GigPersonnel already has a qboBillId, skip it
//     (we don't double-post). For a proper re-push on edit, delete the bill
//     manually in QBO first, then push again — keeps us out of "orphan bill"
//     territory while we iterate.
//
// Response: { created: N, skipped: N, errors: [...] }, plus the gig's
// qboSyncedAt is updated on any successful run.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id: gigId } = await params;

  const conn = await db.qboConnection.findUnique({
    where: { userId: user.id },
  });
  if (!conn) {
    return NextResponse.json(
      { error: "QBO not connected" },
      { status: 400 },
    );
  }
  if (!conn.defaultExpenseAccountId) {
    return NextResponse.json(
      {
        error:
          "No default expense account set. Pick one in Settings → Integrations.",
      },
      { status: 400 },
    );
  }

  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
    include: {
      venue: true,
      personnel: { include: { musician: true } },
    },
  });
  if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });

  const venueLabel = gig.venue?.name ?? "Gig";
  const gigDate = gig.startAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const result = {
    created: 0,
    skipped: 0,
    errors: [] as Array<{ musician: string; message: string }>,
  };

  for (const p of gig.personnel) {
    if (p.musician.isLeader) continue;
    if (!p.paidAt) continue;
    if (p.payCents <= 0) continue;
    if (p.qboBillId) {
      result.skipped++;
      continue;
    }

    try {
      const vendor = await upsertVendor(user.id, p.musician.name, {
        email: p.musician.email,
        phone: p.musician.phone,
      });
      const bill = await createBill(user.id, {
        vendorId: vendor.Id,
        amountCents: p.payCents,
        accountId: conn.defaultExpenseAccountId,
        description: `${venueLabel} · ${gigDate}`,
        txnDate: p.paidAt,
      });
      await db.gigPersonnel.update({
        where: { id: p.id },
        data: { qboVendorId: vendor.Id, qboBillId: bill.Id },
      });
      result.created++;
    } catch (err) {
      result.errors.push({
        musician: p.musician.name,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  await db.gig.update({
    where: { id: gigId },
    data: {
      qboSyncedAt: new Date(),
      qboSyncError: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
    },
  });

  await db.activity.create({
    data: {
      gigId,
      action: "qbo_push",
      summary:
        result.errors.length > 0
          ? `Pushed ${result.created} bill(s) to QuickBooks · ${result.errors.length} error(s)`
          : `Pushed ${result.created} bill(s) to QuickBooks`,
      payload: JSON.parse(JSON.stringify(result)) as object,
    },
  });

  return NextResponse.json(result);
}

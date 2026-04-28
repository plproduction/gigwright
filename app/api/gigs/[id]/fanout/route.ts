import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fanOutGigUpdate } from "@/lib/fanout";

// POST /api/gigs/[id]/fanout
// Triggered by the admin's "Send update" button on the gig detail header.
// Optional body: { triggerLabel?: string } so the admin can tag what changed
// (e.g. "Call time changed"). Default label is just a general update.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const gig = await db.gig.findFirst({ where: { id, ownerId: user.id } });
  if (!gig) {
    return NextResponse.json({ error: "gig not found" }, { status: 404 });
  }

  let body: { triggerLabel?: string; message?: string } = {};
  try {
    body = (await req.json()) as { triggerLabel?: string; message?: string };
  } catch {
    // no body — fine
  }

  const result = await fanOutGigUpdate({
    gigId: id,
    triggerLabel: body.triggerLabel,
    message: body.message,
  });
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { revokeToken } from "@/lib/qbo";

// POST /api/qbo/disconnect → revokes tokens at Intuit (best effort) and
// deletes the local QboConnection row.
export async function POST() {
  const user = await requireUser();
  const conn = await db.qboConnection.findUnique({ where: { userId: user.id } });
  if (conn) {
    await revokeToken(conn.refreshToken);
    await db.qboConnection.delete({ where: { userId: user.id } });
  }
  return NextResponse.redirect(
    `${process.env.AUTH_URL ?? "https://gigwright.com"}/settings/integrations?qbo=disconnected`,
    { status: 303 },
  );
}

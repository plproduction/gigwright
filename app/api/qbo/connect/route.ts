import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/qbo";
import { randomBytes } from "crypto";

// GET /api/qbo/connect → redirects to Intuit's OAuth authorize URL.
// State encodes the userId so the callback can attribute tokens correctly.
export async function GET() {
  const user = await requireUser();
  const nonce = randomBytes(16).toString("hex");
  const state = `${user.id}:${nonce}`;
  return NextResponse.redirect(buildAuthorizeUrl(state));
}

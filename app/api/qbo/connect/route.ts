import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/qbo";
import { isPaid } from "@/lib/plan";
import { randomBytes } from "crypto";

// GET /api/qbo/connect → redirects to Intuit's OAuth authorize URL.
// State encodes the userId so the callback can attribute tokens correctly.
//
// Gated to PRO/ADMIN — FREE users get redirected to billing with a
// reason so the UI can surface a clear "Upgrade to Pro to connect
// QuickBooks" message instead of a silent failure mid-OAuth.
export async function GET() {
  const user = await requireUser();
  if (!isPaid(user.plan)) {
    return NextResponse.redirect(
      new URL(
        "/settings/billing?upgrade=qbo",
        process.env.AUTH_URL ?? "https://gigwright.com",
      ),
    );
  }
  const nonce = randomBytes(16).toString("hex");
  const state = `${user.id}:${nonce}`;
  return NextResponse.redirect(buildAuthorizeUrl(state));
}

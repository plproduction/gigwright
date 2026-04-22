import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  exchangeCodeForTokens,
  listExpenseAccounts,
  pickDefaultExpenseAccount,
} from "@/lib/qbo";

// GET /api/qbo/callback?code=...&state=...&realmId=...
// Intuit redirects here after the user authorizes Gigwright in their QBO
// company. We exchange the code for tokens, store them + the realmId, auto-
// pick a default expense account, and bounce back to Settings → Integrations.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  const base = process.env.AUTH_URL ?? url.origin;
  const back = (qs: string) => `${base}/settings/integrations?${qs}`;

  if (error) {
    return NextResponse.redirect(back(`qbo=error&message=${encodeURIComponent(error)}`));
  }
  if (!code || !state || !realmId) {
    return NextResponse.redirect(back("qbo=error&message=missing_params"));
  }

  const userId = state.split(":")[0];
  if (!userId) {
    return NextResponse.redirect(back("qbo=error&message=bad_state"));
  }

  // Confirm the user still exists
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.redirect(back("qbo=error&message=unknown_user"));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await db.qboConnection.upsert({
      where: { userId },
      update: {
        realmId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
      create: {
        userId,
        realmId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
    });

    // Best-effort: pick a default expense account so the first Push to
    // QuickBooks works without making the user configure anything.
    try {
      const accounts = await listExpenseAccounts(userId);
      const picked = pickDefaultExpenseAccount(accounts);
      if (picked) {
        await db.qboConnection.update({
          where: { userId },
          data: {
            defaultExpenseAccountId: picked.Id,
            defaultExpenseAccountName: picked.Name,
          },
        });
      }
    } catch {
      // Non-fatal — user can pick the account manually in Settings.
    }

    return NextResponse.redirect(back("qbo=connected"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      back(`qbo=error&message=${encodeURIComponent(msg)}`),
    );
  }
}

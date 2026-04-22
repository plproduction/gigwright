import { db } from "@/lib/db";
import type { QboConnection } from "@/lib/generated/prisma/client";

// QuickBooks Online client.
// Implements OAuth helpers, auto-refresh, and the slim set of API calls we
// need to push bills for a gig: upsertVendor, createBill, listAccounts.
// Docs: https://developer.intuit.com/app/developer/qbo/docs/develop

export const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID ?? "";
export const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET ?? "";
export const QBO_REDIRECT_URI = process.env.QBO_REDIRECT_URI ?? "";
export const QBO_ENVIRONMENT =
  (process.env.QBO_ENVIRONMENT as "sandbox" | "production") ?? "sandbox";

// Intuit OAuth2 endpoints — same for sandbox and production; env only
// affects the Accounting API base URL below.
const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const INTUIT_REVOKE_URL =
  "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

// Accounting API base URL (sandbox vs production)
function apiBase(): string {
  return QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: QBO_REDIRECT_URI,
    response_type: "code",
    state,
  });
  return `${INTUIT_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const basic = Buffer.from(
    `${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: QBO_REDIRECT_URI,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(
      `QBO token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

export async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const basic = Buffer.from(
    `${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(
      `QBO token refresh failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

// Returns a valid access token, refreshing transparently if near expiry.
// Persists the new tokens + expiresAt back to the database.
export async function getFreshAccessToken(userId: string): Promise<{
  accessToken: string;
  realmId: string;
  connection: QboConnection;
}> {
  const conn = await db.qboConnection.findUnique({
    where: { userId },
  });
  if (!conn) throw new Error("QBO not connected");

  const now = new Date();
  const refreshWindow = new Date(now.getTime() + 60 * 1000); // 60s buffer
  if (conn.expiresAt > refreshWindow) {
    return {
      accessToken: conn.accessToken,
      realmId: conn.realmId,
      connection: conn,
    };
  }

  const refreshed = await refreshTokens(conn.refreshToken);
  const updated = await db.qboConnection.update({
    where: { userId },
    data: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
    },
  });
  return {
    accessToken: updated.accessToken,
    realmId: updated.realmId,
    connection: updated,
  };
}

// Generic authenticated call to the QBO Accounting API.
async function qboFetch<T = unknown>(
  userId: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> },
): Promise<T> {
  const { accessToken, realmId } = await getFreshAccessToken(userId);
  const url = new URL(`${apiBase()}/${realmId}${path}`);
  url.searchParams.set("minorversion", "75");
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(
      `QBO API ${res.status} for ${path}: ${await res.text().catch(() => "")}`,
    );
  }
  return (await res.json()) as T;
}

// ── Vendor upsert ─────────────────────────────────────────────────

type QboVendor = {
  Id: string;
  DisplayName: string;
  SyncToken: string;
};

export async function findVendorByName(
  userId: string,
  name: string,
): Promise<QboVendor | null> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `SELECT Id, DisplayName, SyncToken FROM Vendor WHERE DisplayName = '${escaped}'`;
  const res = await qboFetch<{
    QueryResponse: { Vendor?: QboVendor[] };
  }>(userId, "/query", { query: { query: q } });
  return res.QueryResponse.Vendor?.[0] ?? null;
}

export async function upsertVendor(
  userId: string,
  name: string,
  opts?: { email?: string | null; phone?: string | null },
): Promise<QboVendor> {
  const existing = await findVendorByName(userId, name);
  if (existing) return existing;

  const body: Record<string, unknown> = { DisplayName: name };
  if (opts?.email) body.PrimaryEmailAddr = { Address: opts.email };
  if (opts?.phone) body.PrimaryPhone = { FreeFormNumber: opts.phone };

  const res = await qboFetch<{ Vendor: QboVendor }>(userId, "/vendor", {
    method: "POST",
    body,
  });
  return res.Vendor;
}

// ── Bill creation ─────────────────────────────────────────────────

export async function createBill(
  userId: string,
  opts: {
    vendorId: string;
    amountCents: number;
    accountId: string;
    description: string;
    txnDate: Date; // the gig's paid date
  },
): Promise<{ Id: string }> {
  const amountDollars = opts.amountCents / 100;

  const body = {
    VendorRef: { value: opts.vendorId },
    TxnDate: opts.txnDate.toISOString().slice(0, 10),
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: amountDollars,
        Description: opts.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: opts.accountId },
        },
      },
    ],
  };

  const res = await qboFetch<{ Bill: { Id: string } }>(userId, "/bill", {
    method: "POST",
    body,
  });
  return res.Bill;
}

// ── Accounts (chart of accounts) ─────────────────────────────────

type QboAccount = {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  Active: boolean;
};

export async function listExpenseAccounts(
  userId: string,
): Promise<QboAccount[]> {
  const q =
    "SELECT Id, Name, AccountType, AccountSubType, Active FROM Account WHERE AccountType = 'Expense' AND Active = true ORDER BY Name";
  const res = await qboFetch<{
    QueryResponse: { Account?: QboAccount[] };
  }>(userId, "/query", { query: { query: q } });
  return res.QueryResponse.Account ?? [];
}

// Pick a sensible default account on first connect. Prefer anything matching
// "contract" or "subcontract" or "band" in the name, else the first expense.
export function pickDefaultExpenseAccount(
  accounts: QboAccount[],
): QboAccount | null {
  const preferred =
    accounts.find((a) => /contract/i.test(a.Name)) ??
    accounts.find((a) => /subcontract/i.test(a.Name)) ??
    accounts.find((a) => /band/i.test(a.Name)) ??
    accounts.find((a) => /professional/i.test(a.Name));
  return preferred ?? accounts[0] ?? null;
}

// ── Disconnect ───────────────────────────────────────────────────

export async function revokeToken(refreshToken: string): Promise<void> {
  const basic = Buffer.from(
    `${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`,
  ).toString("base64");
  await fetch(INTUIT_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: refreshToken }),
  }).catch(() => {
    // Silent — revocation is best-effort; we delete the local row regardless.
  });
}

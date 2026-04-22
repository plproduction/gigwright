import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { listExpenseAccounts, QBO_ENVIRONMENT } from "@/lib/qbo";

type SearchParams = Promise<{
  qbo?: string;
  message?: string;
}>;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { qbo, message } = await searchParams;

  const conn = await db.qboConnection.findUnique({
    where: { userId: user.id },
  });

  // Pull the chart of accounts so the user can pick the default account.
  // Best-effort — if this throws (expired token, etc.) we show the page
  // without the picker and let the user fix it.
  let expenseAccounts: Array<{ Id: string; Name: string }> = [];
  if (conn) {
    try {
      expenseAccounts = await listExpenseAccounts(user.id);
    } catch {
      // quietly degrade
    }
  }

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Integrations
        </h4>
        <Link
          href="/settings"
          className="text-[11px] text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          ← Settings
        </Link>
      </div>

      {/* Status banner */}
      {qbo === "connected" && (
        <div className="mb-6 rounded-[10px] border border-success/30 bg-success/10 px-5 py-4">
          <div className="font-serif text-[16px] text-success">
            QuickBooks connected.
          </div>
          <div className="mt-1 text-[13px] text-ink-soft">
            GigWright can now post bills to your books when a gig is fully
            paid. Use the “Push to QuickBooks” button on any gig.
          </div>
        </div>
      )}
      {qbo === "disconnected" && (
        <div className="mb-6 rounded-[10px] border border-line bg-paper-warm px-5 py-4 text-[13px] text-ink-soft">
          QuickBooks disconnected.
        </div>
      )}
      {qbo === "error" && (
        <div className="mb-6 rounded-[10px] border border-accent/30 bg-accent-soft px-5 py-4">
          <div className="font-serif text-[16px] text-accent">
            Couldn’t connect to QuickBooks.
          </div>
          {message && (
            <div className="mt-1 text-[12px] text-ink-soft">
              {decodeURIComponent(message)}
            </div>
          )}
        </div>
      )}

      {/* QuickBooks card */}
      <div className="rounded-[10px] border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-serif text-[22px] font-normal tracking-tight">
              QuickBooks Online
            </div>
            <div className="mt-1 text-[13px] text-ink-soft">
              When all musicians on a gig are paid, push a bill for each to
              your QuickBooks company. 1099-ready at year-end.
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
              conn
                ? "border-success/30 bg-success/10 text-success"
                : "border-line-strong bg-paper text-ink-mute"
            }`}
          >
            {conn ? "Connected" : "Not connected"}
          </span>
        </div>

        {conn ? (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  Company
                </div>
                <div className="mt-1 font-mono text-[12px]">{conn.realmId}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  Environment
                </div>
                <div className="mt-1 font-semibold">
                  {QBO_ENVIRONMENT === "production" ? "Live books" : "Sandbox (test)"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  Connected
                </div>
                <div className="mt-1">
                  {conn.connectedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  Default expense account
                </div>
                <div className="mt-1">
                  {conn.defaultExpenseAccountName ?? (
                    <span className="text-accent">Not set</span>
                  )}
                </div>
              </div>
            </div>

            {/* Account picker */}
            {expenseAccounts.length > 0 && (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const id = String(formData.get("accountId") ?? "");
                  const name =
                    expenseAccounts.find((a) => a.Id === id)?.Name ?? null;
                  await db.qboConnection.update({
                    where: { userId: user.id },
                    data: {
                      defaultExpenseAccountId: id,
                      defaultExpenseAccountName: name,
                    },
                  });
                }}
                className="flex items-end gap-3"
              >
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                    Band pay posts to
                  </span>
                  <select
                    name="accountId"
                    defaultValue={conn.defaultExpenseAccountId ?? ""}
                    className="input"
                  >
                    <option value="" disabled>
                      — Select an expense account —
                    </option>
                    {expenseAccounts.map((a) => (
                      <option key={a.Id} value={a.Id}>
                        {a.Name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-md border border-line-strong bg-transparent px-4 py-2 text-[13px] font-medium text-ink hover:bg-paper-warm"
                >
                  Save
                </button>
              </form>
            )}

            <form action="/api/qbo/disconnect" method="POST">
              <button
                type="submit"
                className="rounded-md border border-accent/30 bg-transparent px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5">
            <a
              href="/api/qbo/connect"
              className="inline-flex rounded-md bg-accent px-5 py-2.5 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
            >
              Connect QuickBooks
            </a>
            <p className="mt-3 text-[11px] italic text-ink">
              You’ll be redirected to Intuit, pick your Patrick Lamb Productions
              company, and come back here.
            </p>
          </div>
        )}
      </div>

      {/* Future integrations placeholder */}
      <div className="mt-10">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          Coming soon
        </div>
        <ul className="space-y-2 text-[13px] text-ink-soft">
          <li className="flex gap-2">
            <span className="text-accent">·</span> iCloud Calendar (CalDAV) per musician
          </li>
          <li className="flex gap-2">
            <span className="text-accent">·</span> Google Calendar per musician
          </li>
          <li className="flex gap-2">
            <span className="text-accent">·</span> Outlook / Microsoft 365 Calendar
          </li>
          <li className="flex gap-2">
            <span className="text-accent">·</span> Twilio SMS fanout (pending 10DLC approval)
          </li>
        </ul>
      </div>
    </>
  );
}

import Link from "next/link";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import {
  createRole,
  updateRole,
  deleteRole,
  moveRole,
  addToCallList,
  removeFromCallList,
  moveInCallList,
  createLineup,
  updateLineup,
  deleteLineup,
  addRoleToLineup,
  removeRoleFromLineup,
} from "@/lib/actions/roles";

// One page for the whole shape of the band: the roles you book, who you
// call for each, and the lineups you sell. Deliberately one screen —
// the obvious competitor splits this across four (Roles, Roles & Call
// Order, Bulk Assign Roles, Member Profiles) and you spend the day
// walking between them.

export const dynamic = "force-dynamic";

function money(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold tracking-[0.14em] text-ink-mute uppercase">
      {children}
    </span>
  );
}

export default async function RolesPage() {
  const user = await requireBandleader();

  const [roles, lineups, musicians] = await Promise.all([
    db.role.findMany({
      where: { ownerId: user.id },
      orderBy: { position: "asc" },
      include: {
        members: {
          orderBy: { callOrder: "asc" },
          include: { musician: { select: { id: true, name: true } } },
        },
      },
    }),
    db.lineup.findMany({
      where: { ownerId: user.id },
      orderBy: { position: "asc" },
      include: {
        roles: {
          orderBy: { position: "asc" },
          include: { role: { select: { name: true, defaultPayCents: true } } },
        },
      },
    }),
    db.musician.findMany({
      where: { ownerId: user.id },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="-mx-8 -mt-7 -mb-9">
      <div className="flex items-center gap-2 border-b border-line bg-paper-warm px-6 py-4">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">Roles &amp; lineups</h4>
        <span className="text-[12px] text-ink-mute">
          · {roles.length} roles · {lineups.length} lineups
        </span>
        <Link href="/roster" className="ml-auto text-[12px] text-accent hover:underline">
          Roster →
        </Link>
      </div>

      <div className="px-6 py-6">
        {/* ── Roles ─────────────────────────────────────────── */}
        <div className="mb-3 flex items-baseline gap-3">
          <h5 className="text-[12px] font-semibold text-ink">Roles</h5>
          <span className="text-[11px] text-ink-mute">
            The jobs on the stand. Call order is who you ring first.
          </span>
        </div>

        <div className="mb-7 overflow-hidden rounded-[10px] border border-line">
          {roles.length === 0 && (
            <div className="bg-paper px-4 py-5 text-[12px] text-ink-mute">
              No roles yet. Add Saxophone, Drums, Sound Tech — whatever you actually book.
            </div>
          )}

          {roles.map((role, i) => (
            <div key={role.id} className="border-b border-line bg-paper last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <form
                  action={updateRole.bind(null, role.id)}
                  className="grid flex-1 grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-2"
                >
                  <input
                    name="name"
                    defaultValue={role.name}
                    className="input font-medium"
                    aria-label="Role name"
                  />
                  <input
                    name="defaultPay"
                    defaultValue={money(role.defaultPayCents)}
                    placeholder="Rate $"
                    className="input text-right"
                    aria-label="Default rate"
                  />
                  <button type="submit" className="text-[11px] font-medium text-accent hover:underline">
                    Save
                  </button>
                </form>

                <div className="ml-auto flex items-center gap-1.5">
                  {i > 0 && (
                    <form action={moveRole.bind(null, role.id, "up")}>
                      <button className="rounded border border-line px-1.5 text-[11px] text-ink-mute hover:bg-paper-warm">
                        ↑
                      </button>
                    </form>
                  )}
                  {i < roles.length - 1 && (
                    <form action={moveRole.bind(null, role.id, "down")}>
                      <button className="rounded border border-line px-1.5 text-[11px] text-ink-mute hover:bg-paper-warm">
                        ↓
                      </button>
                    </form>
                  )}
                  <form action={deleteRole.bind(null, role.id)}>
                    <button className="text-[11px] text-ink-mute hover:text-accent">Delete</button>
                  </form>
                </div>
              </div>

              {/* Call order */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-paper-warm/40 px-4 py-2.5">
                <Label>Call order</Label>
                {role.members.length === 0 && (
                  <span className="text-[11px] text-ink-mute">nobody yet</span>
                )}
                {role.members.map((m, j) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px]"
                  >
                    <span className="text-ink-mute">{j + 1}.</span>
                    {m.musician.name}
                    {j > 0 && (
                      <form action={moveInCallList.bind(null, m.id, "up")} className="inline">
                        <button className="text-ink-mute hover:text-accent" title="Move up">
                          ↑
                        </button>
                      </form>
                    )}
                    {j < role.members.length - 1 && (
                      <form action={moveInCallList.bind(null, m.id, "down")} className="inline">
                        <button className="text-ink-mute hover:text-accent" title="Move down">
                          ↓
                        </button>
                      </form>
                    )}
                    <form action={removeFromCallList.bind(null, m.id)} className="inline">
                      <button className="text-ink-mute hover:text-accent" title="Remove">
                        ×
                      </button>
                    </form>
                  </span>
                ))}
                <form action={addToCallList.bind(null, role.id)} className="flex items-center gap-1.5">
                  <select name="musicianId" className="input w-[150px] py-1 text-[11px]" style={{ width: 150 }} defaultValue="">
                    <option value="">+ add player…</option>
                    {musicians.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button className="text-[11px] font-medium text-accent hover:underline">Add</button>
                </form>
              </div>
            </div>
          ))}

          <form
            action={createRole}
            className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-2 border-t border-line bg-paper-warm/60 px-4 py-3"
          >
            <input name="name" placeholder="New role, e.g. Trumpet 1" className="input" />
            <input name="defaultPay" placeholder="Rate $" className="input text-right" />
            <button className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-paper">
              Add role
            </button>
          </form>
        </div>

        {/* ── Lineups ───────────────────────────────────────── */}
        <div className="mb-3 flex items-baseline gap-3">
          <h5 className="text-[12px] font-semibold text-ink">Lineups</h5>
          <span className="text-[11px] text-ink-mute">
            The band shapes you sell. Picking one on a gig fills the roster and the invoice.
          </span>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-line">
          {lineups.length === 0 && (
            <div className="bg-paper px-4 py-5 text-[12px] text-ink-mute">
              No lineups yet. These are your packages — name, size, and what the client pays.
            </div>
          )}

          {lineups.map((lineup) => {
            const bandCost = lineup.roles.reduce(
              (sum, lr) => sum + (lr.payCents ?? lr.role.defaultPayCents ?? 0) * lr.count,
              0,
            );
            const players = lineup.roles.reduce((sum, lr) => sum + lr.count, 0);
            return (
              <div key={lineup.id} className="border-b border-line bg-paper last:border-b-0">
                <form
                  action={updateLineup.bind(null, lineup.id)}
                  className="grid grid-cols-[minmax(0,160px)_90px_110px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3"
                >
                  <input
                    name="name"
                    defaultValue={lineup.name}
                    className="input font-medium"
                    aria-label="Lineup name"
                  />
                  <input
                    name="sizeLabel"
                    defaultValue={lineup.sizeLabel ?? ""}
                    placeholder="7 Piece"
                    className="input"
                    aria-label="Size"
                  />
                  <input
                    name="clientPrice"
                    defaultValue={money(lineup.clientPriceCents)}
                    placeholder="Client $"
                    className="input text-right"
                    aria-label="Client price"
                  />
                  <input
                    name="description"
                    defaultValue={lineup.description ?? ""}
                    placeholder="One line for the proposal"
                    className="input"
                    aria-label="Description"
                  />
                  <button type="submit" className="text-[11px] font-medium text-accent hover:underline">
                    Save
                  </button>
                </form>

                <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-paper-warm/40 px-4 py-2.5">
                  <Label>Roles</Label>
                  {lineup.roles.length === 0 && (
                    <span className="text-[11px] text-ink-mute">none yet</span>
                  )}
                  {lineup.roles.map((lr) => (
                    <span
                      key={lr.id}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px]"
                    >
                      {lr.role.name}
                      {lr.count > 1 && <span className="text-ink-mute">×{lr.count}</span>}
                      <form action={removeRoleFromLineup.bind(null, lr.id)} className="inline">
                        <button className="text-ink-mute hover:text-accent" title="Remove">
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                  <form
                    action={addRoleToLineup.bind(null, lineup.id)}
                    className="flex items-center gap-1.5"
                  >
                    <select name="roleId" className="input py-1 text-[11px]" style={{ width: 130 }} defaultValue="">
                      <option value="">+ add role…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <input
                      name="count"
                      defaultValue="1"
                      className="input py-1 text-center text-[11px]" style={{ width: 48 }}
                      aria-label="How many"
                    />
                    <input
                      name="pay"
                      placeholder="$"
                      className="input py-1 text-right text-[11px]" style={{ width: 70 }}
                      aria-label="Rate for this lineup"
                    />
                    <button className="text-[11px] font-medium text-accent hover:underline">Add</button>
                  </form>

                  <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-mute">
                    {players > 0 && (
                      <span>
                        {players} players · band {" "}
                        <span className="tabular-nums text-ink">${money(bandCost)}</span>
                        {lineup.clientPriceCents != null && (
                          <>
                            {" · margin "}
                            <span className="tabular-nums text-success">
                              ${money(lineup.clientPriceCents - bandCost)}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                    <form action={deleteLineup.bind(null, lineup.id)}>
                      <button className="hover:text-accent">Delete</button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}

          <form
            action={createLineup}
            className="grid grid-cols-[minmax(0,160px)_90px_110px_minmax(0,1fr)_auto] items-center gap-2 border-t border-line bg-paper-warm/60 px-4 py-3"
          >
            <input name="name" placeholder="New lineup, e.g. The Floor" className="input" />
            <input name="sizeLabel" placeholder="7 Piece" className="input" />
            <input name="clientPrice" placeholder="Client $" className="input text-right" />
            <input
              name="description"
              placeholder="One line for the proposal"
              className="input"
            />
            <button className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-paper">
              Add lineup
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

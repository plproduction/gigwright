import Link from "next/link";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { AutoSubmitSelect, AutoSubmitNumber } from "@/components/AutoSubmitSelect";
import { FREE_LIMITS, isPaid } from "@/lib/plan";
import {
  createRole,
  seedSuggestedRoles,
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

// The band, as you actually think about it: the roles you book, who you
// call for each, and the lineups you sell. Deliberately one screen —
// the obvious competitor splits this across four (Roles, Roles & Call
// Order, Bulk Assign Roles, Member Profiles) and you spend the day
// walking between them.
//
// This is /roster. An alphabetical list of names is a filing cabinet,
// not a band — it answers "is Drew in here?" and nothing else. Roles
// answer the question you actually have on a Tuesday, which is "who do
// I call for tenor." The A–Z list is still one click away at
// /roster/all for the times you want the filing cabinet.

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

export default async function BandPage() {
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
      // callLists comes back so the page can show who isn't on one yet.
      // Nobody should be able to fall out of the band just because the
      // primary view groups by role.
      select: { id: true, name: true, callLists: { select: { id: true } } },
    }),
  ]);

  const unassigned = musicians.filter((m) => m.callLists.length === 0);
  const paid = isPaid(user.plan);
  const atCap = !paid && musicians.length >= FREE_LIMITS.musicians;

  return (
    <div className="-mx-8 -mt-7 -mb-9">
      <div className="flex items-center gap-2 border-b border-line bg-paper-warm px-6 py-4">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">Band</h4>
        <span className="text-[12px] text-ink-mute">
          · {musicians.length} {musicians.length === 1 ? "member" : "members"} ·{" "}
          {roles.length} {roles.length === 1 ? "role" : "roles"} ·{" "}
          {lineups.length} {lineups.length === 1 ? "lineup" : "lineups"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/roster/all"
            className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-paper-warm"
          >
            All members A–Z
          </Link>
          {atCap ? (
            <Link
              href="/settings/billing?upgrade=musicians"
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-[#611B11]"
            >
              Upgrade to add more
            </Link>
          ) : (
            <Link
              href="/roster/new"
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-black"
            >
              + New member
            </Link>
          )}
        </div>
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
            <div className="flex flex-wrap items-center gap-3 bg-paper px-4 py-5 text-[12px] text-ink-mute">
              <span>
                No roles yet. These are the chairs you book — Saxophone, Drums,
                Sound Tech, whatever you actually hire.
              </span>
              <form action={seedSuggestedRoles}>
                <button className="rounded-md bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper hover:bg-black">
                  Start me off with the usual ones
                </button>
              </form>
            </div>
          )}

          {roles.map((role, i) => (
            // One row per role: the chair, what it pays, and the people
            // you call for it, left to right. The call list used to sit on
            // a second row of its own, which made every role two lines
            // tall and left the right-hand two thirds of the page empty.
            <div
              key={role.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 py-2.5 last:border-b-0"
            >
              <form
                action={updateRole.bind(null, role.id)}
                className="flex shrink-0 items-center gap-1.5"
              >
                {/* .input sets width:100% and beats Tailwind width
                    utilities on source order, so these are inline. */}
                <input
                  name="name"
                  defaultValue={role.name}
                  className="input font-medium"
                  style={{ width: 170 }}
                  aria-label="Role name"
                />
                <input
                  name="defaultPay"
                  defaultValue={money(role.defaultPayCents)}
                  placeholder="Rate"
                  className="input text-right"
                  style={{ width: 72 }}
                  aria-label="Default rate"
                />
                <button
                  type="submit"
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  Save
                </button>
              </form>

              <span className="h-4 w-px shrink-0 bg-line" />

              {/* Call order */}
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
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
                <form action={addToCallList.bind(null, role.id)}>
                  <AutoSubmitSelect
                    name="musicianId"
                    placeholder={
                      role.members.length === 0 ? "nobody yet — add…" : "+ add…"
                    }
                    className="input py-0.5 text-[11px]"
                    options={musicians
                      .filter((m) => !role.members.some((rm) => rm.musicianId === m.id))
                      .map((m) => ({ value: m.id, label: m.name }))}
                  />
                </form>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
                  <button className="text-[11px] text-ink-mute hover:text-accent">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}

          <form
            action={createRole}
            className="flex items-center gap-1.5 border-t border-line bg-paper-warm/60 px-4 py-2.5"
          >
            <input
              name="name"
              placeholder="New role, e.g. Trumpet 1"
              className="input"
              style={{ width: 170 }}
            />
            <input
              name="defaultPay"
              placeholder="Rate"
              className="input text-right"
              style={{ width: 72 }}
            />
            <button className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-paper">
              Add role
            </button>
          </form>
        </div>

        {/* ── Not on a call list ────────────────────────────── */}
        {unassigned.length > 0 && (
          <div className="mb-7">
            <div className="mb-3 flex items-baseline gap-3">
              <h5 className="text-[12px] font-semibold text-ink">
                Not on a call list
              </h5>
              <span className="text-[11px] text-ink-mute">
                On your roster but not attached to a role yet — add them to one
                above, or open them to set it.
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-line bg-paper px-4 py-3.5">
              {unassigned.map((m) => (
                <Link
                  key={m.id}
                  href={`/roster/${m.id}/edit`}
                  className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[11px] text-ink-soft hover:border-accent hover:text-accent"
                >
                  {m.name}
                </Link>
              ))}
            </div>
          </div>
        )}

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
                      <form action={addRoleToLineup.bind(null, lineup.id)} className="inline-flex">
                        <input type="hidden" name="roleId" value={lr.roleId} />
                        <span className="text-ink-mute">×</span>
                        <AutoSubmitNumber
                          name="count"
                          defaultValue={lr.count}
                          ariaLabel={`How many ${lr.role.name}`}
                          className="w-[30px] bg-transparent text-center text-[11px] outline-none"
                        />
                      </form>
                      <form action={removeRoleFromLineup.bind(null, lr.id)} className="inline">
                        <button className="text-ink-mute hover:text-accent" title="Remove">
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                  <form action={addRoleToLineup.bind(null, lineup.id)}>
                    <AutoSubmitSelect
                      name="roleId"
                      placeholder="+ add role…"
                      className="input py-1 text-[11px]"
                      options={roles
                        .filter((r) => !lineup.roles.some((lr) => lr.roleId === r.id))
                        .map((r) => ({ value: r.id, label: r.name }))}
                    />
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

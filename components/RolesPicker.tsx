// Roles on the musician form. Every role the bandleader books is a chip;
// tapping one toggles it. No dropdown to open, no panel to dismiss, no
// "Add" button to find afterwards — the tap IS the decision, which is
// the same rule the Band page's pickers follow.
//
// Pure HTML: a hidden checkbox per chip with `peer`, and the visible
// chip styled off `peer-checked`. No client component, no JS, works
// with the form's existing progressive enhancement.
//
// Posting a musician sends `roleIds` (zero or more) plus anything typed
// into `newRoles`; lib/role-sync.ts turns that into call-list membership.
export function RolesPicker({
  roles,
  selected,
}: {
  roles: { id: string; name: string }[];
  selected: string[];
}) {
  const chosen = new Set(selected);

  return (
    <div className="flex flex-col gap-2">
      {roles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <label key={r.id} className="cursor-pointer">
              <input
                type="checkbox"
                name="roleIds"
                value={r.id}
                defaultChecked={chosen.has(r.id)}
                className="peer sr-only"
              />
              <span className="inline-block rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] text-ink-soft transition-colors hover:border-ink-mute peer-checked:border-accent peer-checked:bg-accent peer-checked:text-paper peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
                {r.name}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] leading-[1.45] text-ink-mute">
          No roles set up yet. Type one below, or build the list on the{" "}
          <span className="font-medium text-ink-soft">Band</span> page.
        </p>
      )}

      <input
        name="newRoles"
        placeholder="Or add a new role — Fiddle, Music Director"
        className="input text-[12px]"
        aria-label="Add a new role"
      />
    </div>
  );
}

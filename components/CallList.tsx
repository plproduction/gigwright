"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveInCallList, removeFromCallList, reorderCallList } from "@/lib/actions/roles";

// The call list for one role — who you ring, in the order you ring them.
//
// This replaced three 9×16px glyphs sitting 3px apart inside a 22px pill
// (Patrick, 2026-11-22: "the arrows don't work", "the X's don't work
// either"). They worked; nobody could hit them. Measured on his own
// screen, the ↑ was 9.1px wide and 2.9px from the ↓, which was 3.9px
// from a × that deletes somebody. Apple asks for 44px, WCAG for 24px.
//
// So: drag a name to move it, which is what he asked for and what the
// job actually is ("Alex is my first call now"), with arrows kept at a
// real 24px for keyboard users and single-step nudges, and the delete
// pulled out of the cluster and behind a confirm so a near-miss can't
// quietly drop a player from the list.
type Member = {
  id: string;
  // Musician.id — distinct from the RoleMember id above. Needed so
  // the name can link to /roster/[musicianId]/edit, where the
  // bandleader toggles role chips to fix a mis-categorised player
  // (Patrick 2026-11-24: "Britnee is a vocalist but she's in the
  // bass player or guitar player").
  musicianId: string;
  name: string;
  note: string | null;
};

export function CallList({
  roleId,
  roleName,
  members,
}: {
  roleId: string;
  roleName: string;
  members: Member[];
}) {
  // Optimistic order so a drag lands instantly instead of waiting on a
  // round trip to us-east-1. The server is still the authority; a failed
  // write snaps back on the next render.
  const [order, setOrder] = useOptimistic(members);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Touch and pen don't fire HTML5 drag events. Tapping the grip picks a
  // name up instead; tapping another name drops it there. State, not a
  // ref, because the picked-up name has to look picked up.
  const [heldId, setHeldId] = useState<string | null>(null);

  const commit = (next: Member[]) => {
    startTransition(async () => {
      setOrder(next);
      await reorderCallList(roleId, next.map((m) => m.id));
    });
  };

  const moveTo = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = order.findIndex((m) => m.id === fromId);
    const to = order.findIndex((m) => m.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    commit(next);
  };

  const nudge = (id: string, direction: "up" | "down") => {
    const i = order.findIndex((m) => m.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    startTransition(async () => {
      setOrder(next);
      // Single-step swap has its own narrow action — cheaper than
      // renumbering the whole list, and it predates the drag.
      await moveInCallList(id, direction);
    });
  };

  if (order.length === 0) return null;

  return (
    <ol
      className={`flex flex-wrap items-center gap-1.5 transition-opacity ${
        pending ? "opacity-70" : ""
      }`}
      aria-label={`${roleName} call list, in call order`}
    >
      {order.map((m, i) => {
        const dragging = dragId === m.id;
        const isOver = overId === m.id && dragId !== m.id;
        return (
          <li
            key={m.id}
            draggable
            onDragStart={(e) => {
              setDragId(m.id);
              e.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag without payload.
              e.dataTransfer.setData("text/plain", m.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(m.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === m.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragId ?? e.dataTransfer.getData("text/plain");
              setDragId(null);
              setOverId(null);
              if (from) moveTo(from, m.id);
            }}
            onClick={() => {
              // Only meaningful once something is held (touch path).
              if (!heldId) return;
              const from = heldId;
              setHeldId(null);
              moveTo(from, m.id);
            }}
            className={[
              "group inline-flex items-center gap-1 rounded-full border bg-surface py-0.5 pl-2 pr-1 text-[11px]",
              "cursor-grab active:cursor-grabbing select-none",
              dragging ? "opacity-40" : "",
              isOver ? "border-accent ring-1 ring-accent/40" : "border-line",
              heldId === m.id ? "border-accent bg-paper-warm" : "",
            ].join(" ")}
            title="Drag to change call order"
          >
            {/* Grip — the affordance. Without it nothing says "draggable".
                Also the touch pick-up target, at a real 24px. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHeldId((cur) => (cur === m.id ? null : m.id));
              }}
              aria-label={
                heldId === m.id
                  ? `${m.name} picked up — tap another name to drop them there`
                  : `Pick up ${m.name} to move them in the ${roleName} call list`
              }
              className="-ml-1 inline-flex h-[26px] w-[20px] items-center justify-center text-[9px] leading-none text-ink-mute/50 group-hover:text-ink-mute"
            >
              ⠿
            </button>
            <span className="tabular-nums text-ink-mute">{i + 1}.</span>
            {/* Clicking the name jumps straight to the musician's edit
                page, where their role tags live. One click to move a
                mis-categorised player (Britnee from Guitar to Vocals).
                stopPropagation keeps the chip's onClick (touch-drop
                handler) from firing on a plain click. draggable on the
                <li> starts on mousedown-plus-motion, so a plain click
                doesn't initiate a drag. */}
            <Link
              href={`/roster/${m.musicianId}/edit`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="whitespace-nowrap font-medium hover:underline hover:decoration-accent/50 hover:underline-offset-4"
              title={`Edit ${m.name} (change roles, contact, pay)`}
              draggable={false}
            >
              {m.name}
            </Link>
            {m.note && (
              <span className="whitespace-nowrap text-ink-mute/70">· {m.note}</span>
            )}

            <span className="ml-0.5 inline-flex items-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); nudge(m.id, "up"); }}
                disabled={i === 0 || pending}
                aria-label={`Move ${m.name} up in the ${roleName} call list`}
                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-paper-warm hover:text-accent disabled:pointer-events-none disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); nudge(m.id, "down"); }}
                disabled={i === order.length - 1 || pending}
                aria-label={`Move ${m.name} down in the ${roleName} call list`}
                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-paper-warm hover:text-accent disabled:pointer-events-none disabled:opacity-25"
              >
                ↓
              </button>
            </span>

            {/* Delete, deliberately set apart from the arrows by a rule
                and gated behind a confirm. The old × was 3.9px from the
                ↓ and removed somebody on the first click. */}
            <span className="mx-0.5 h-3.5 w-px bg-line" aria-hidden="true" />
            {confirmId === m.id ? (
              <span className="inline-flex items-center gap-1 pr-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startTransition(async () => {
                      setConfirmId(null);
                      setOrder(order.filter((x) => x.id !== m.id));
                      await removeFromCallList(m.id);
                    });
                  }}
                  className="rounded-full bg-accent px-2 py-[3px] text-[10px] font-medium text-paper"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                  className="px-1 py-[3px] text-[10px] text-ink-mute hover:text-ink"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmId(m.id); }}
                aria-label={`Remove ${m.name} from the ${roleName} call list`}
                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-accent/10 hover:text-accent"
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

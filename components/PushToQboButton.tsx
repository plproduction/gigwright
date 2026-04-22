"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type State =
  | { kind: "not-connected" }
  | { kind: "no-account" }
  | { kind: "partial"; paidCount: number; totalCount: number }
  | { kind: "nothing-to-push" }
  | { kind: "ready"; toPostCount: number }
  | { kind: "stale"; lastSyncedAt: Date }
  | { kind: "synced"; lastSyncedAt: Date };

// The "Push to QuickBooks" button on the payout worksheet header.
// Renders a state-aware chip that changes label + color based on whether the
// gig is ready to post, already synced, edited since last push, etc.
export function PushToQboButton({
  gigId,
  state,
}: {
  gigId: string;
  state: State;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  function push() {
    startTransition(async () => {
      const res = await fetch(`/api/qbo/push-gig/${gigId}`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        created?: number;
        skipped?: number;
        errors?: Array<{ musician: string; message: string }>;
        error?: string;
      };
      if (json.error) {
        setResult(`Error: ${json.error}`);
      } else {
        const created = json.created ?? 0;
        const errs = json.errors?.length ?? 0;
        setResult(
          errs > 0
            ? `Pushed ${created}, ${errs} error${errs === 1 ? "" : "s"}`
            : `Pushed ${created} bill${created === 1 ? "" : "s"} to QBO`,
        );
      }
      router.refresh();
    });
  }

  const base =
    "rounded-md px-4 py-2 text-[12px] font-semibold transition-colors";

  switch (state.kind) {
    case "not-connected":
      return (
        <a
          href="/settings/integrations"
          className={`${base} border border-line-strong bg-transparent text-ink-mute hover:bg-paper-warm`}
        >
          Connect QuickBooks
        </a>
      );
    case "no-account":
      return (
        <a
          href="/settings/integrations"
          title="Pick a default expense account in Settings → Integrations"
          className={`${base} border border-accent/30 bg-accent-soft text-accent hover:bg-accent hover:text-paper`}
        >
          Pick QBO account to post to →
        </a>
      );
    case "partial":
      return (
        <span
          className={`${base} cursor-not-allowed border border-line bg-paper text-ink-mute`}
          title="Mark every musician paid to enable"
        >
          QBO · {state.paidCount} of {state.totalCount} paid
        </span>
      );
    case "nothing-to-push":
      return (
        <span
          className={`${base} cursor-not-allowed border border-line bg-paper text-ink-mute`}
        >
          Nothing to push to QBO
        </span>
      );
    case "ready":
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={push}
            disabled={pending}
            className={`${base} bg-accent text-paper hover:bg-[#611B11] disabled:opacity-50`}
          >
            {pending
              ? "Pushing…"
              : `Push ${state.toPostCount} bill${state.toPostCount === 1 ? "" : "s"} to QuickBooks`}
          </button>
          {result && (
            <span className="text-[11px] text-ink-soft">{result}</span>
          )}
        </div>
      );
    case "synced":
      return (
        <span
          className={`${base} border border-success/30 bg-success/10 text-success`}
          title={state.lastSyncedAt.toLocaleString()}
        >
          ✓ Synced to QBO ·{" "}
          {state.lastSyncedAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      );
    case "stale":
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={push}
            disabled={pending}
            className={`${base} border border-warn/40 bg-warn/10 text-warn hover:bg-warn hover:text-paper disabled:opacity-50`}
          >
            {pending ? "Pushing…" : "Changes since sync · Re-push"}
          </button>
          {result && (
            <span className="text-[11px] text-ink-soft">{result}</span>
          )}
        </div>
      );
  }
}

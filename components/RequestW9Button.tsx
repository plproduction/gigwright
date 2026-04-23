"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestW9 } from "@/lib/actions/w9";

// "Request" button next to the W-9 pill on the roster. Sends the musician
// a one-shot W-9 request email via Resend. Disabled when the musician has
// no email or the W-9 is already received.
export function RequestW9Button({
  musicianId,
  hasEmail,
  requestedAt,
}: {
  musicianId: string;
  hasEmail: boolean;
  requestedAt: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: "ok" }
    | { kind: "err"; msg: string }
    | null
  >(null);

  if (!hasEmail) {
    return (
      <span
        className="text-[10px] italic text-ink-mute"
        title="Add an email to send a W-9 request"
      >
        No email
      </span>
    );
  }

  function send() {
    startTransition(async () => {
      const res = await requestW9(musicianId);
      if (res.sent) {
        setResult({ kind: "ok" });
        router.refresh();
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult({ kind: "err", msg: res.reason ?? "Failed" });
        setTimeout(() => setResult(null), 4000);
      }
    });
  }

  const already = !!requestedAt;

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="rounded-md border border-line-strong bg-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink hover:border-accent hover:text-accent disabled:opacity-50"
        title={
          already
            ? `Last requested ${requestedAt!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — send another`
            : "Email this musician a W-9 request"
        }
      >
        {pending ? "Sending…" : already ? "Resend W-9" : "Request W-9"}
      </button>
      {result?.kind === "ok" && (
        <span className="text-[10px] text-success">Sent ✓</span>
      )}
      {result?.kind === "err" && (
        <span className="text-[10px] text-accent">{result.msg}</span>
      )}
    </div>
  );
}

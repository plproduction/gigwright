"use client";

import { useState, useTransition } from "react";

// Small button on the musician edit form that fires /api/musicians/[id]/invite
// to send the "You have been added to GigWright" email with the custom copy.
// Shows a confirmation toast inline after firing.
export function InviteMusicianButton({
  musicianId,
  hasEmail,
  invitedAt,
}: {
  musicianId: string;
  hasEmail: boolean;
  invitedAt: Date | null;
}) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const res = await fetch(`/api/musicians/${musicianId}/invite`, {
        method: "POST",
      });
      if (res.ok) {
        setState("sent");
        setMessage(null);
      } else {
        setState("error");
        try {
          const json = (await res.json()) as { error?: string };
          setMessage(json.error ?? "Send failed");
        } catch {
          setMessage("Send failed");
        }
      }
    });
  }

  if (!hasEmail) {
    return (
      <div className="text-[11px] italic text-ink-mute">
        Add an email above to enable the login invite.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
      >
        {pending
          ? "Sending…"
          : state === "sent"
            ? "✓ Invite sent — send again"
            : invitedAt
              ? `Resend invite · sent ${invitedAt.toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" },
                )}`
              : "Send login invite"}
      </button>
      {state === "error" && message && (
        <span className="text-[11px] text-accent">{message}</span>
      )}
    </div>
  );
}

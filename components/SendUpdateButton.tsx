"use client";

import { useState, useTransition } from "react";

// "Send update" button on the gig detail header. Fires email + SMS fanout
// to every personnel with the matching notify flag and contact info on file.
//
// Two inputs:
//   • "What changed" tag — short, one-liner ("Call time moved to 7pm").
//     Renders as a small banner / eyebrow on the email.
//   • Message — full free-form note from the bandleader. Renders FIRST in
//     the email (above the structural gig info) so musicians see the new
//     info immediately. Email then follows with the standardized
//     meat-and-potatoes (date, venue, times, attire, load-in spot, lineup).
export function SendUpdateButton({ gigId }: { gigId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");

  function send() {
    startTransition(async () => {
      const res = await fetch(`/api/gigs/${gigId}/fanout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerLabel: label.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setResult(`Error: ${res.status}`);
        return;
      }
      const json = (await res.json()) as {
        emailsSent: number;
        emailsSkipped: number;
        smsSent: number;
        smsSkipped: number;
        errors?: Array<{ name: string; message: string; channel?: "email" | "sms" }>;
      };
      const errCount = json.errors?.length ?? 0;
      const base = `Emailed ${json.emailsSent} · Texted ${json.smsSent}`;
      setResult(
        errCount > 0
          ? `${base} · ${errCount} error${errCount === 1 ? "" : "s"}`
          : base,
      );
      setConfirming(false);
      setLabel("");
      setMessage("");
    });
  }

  if (!confirming) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-black"
        >
          Send update
        </button>
        {result && (
          <span className="text-[11px] text-ink-soft">{result}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-line-strong bg-paper p-3">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What changed? (optional, one line) — e.g. Call time moved to 7pm"
        className="w-full rounded-md border border-line bg-paper-warm px-3 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Optional message to the band — anything you want them to read first."
        rows={4}
        className="w-full resize-y rounded-md border border-line bg-paper-warm px-3 py-2 text-[13px] leading-snug text-ink outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-[#611B11] disabled:opacity-50"
        >
          {pending ? "Sending…" : "Email band"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setLabel("");
            setMessage("");
          }}
          className="text-[11px] text-ink-mute hover:text-ink"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10.5px] text-ink-mute">
          The email will lead with your message, then date / venue / times /
          load-in spot / lineup.
        </span>
      </div>
    </div>
  );
}

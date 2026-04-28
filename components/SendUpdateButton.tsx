"use client";

import { useState, useTransition } from "react";

// "Send update" button on the gig detail header. Fires email + SMS fanout
// to every personnel with the matching notify flag and contact info on
// file. Email goes via Resend, SMS via Twilio.
//
// Optional trigger label lets the admin tag what changed — shows up as a
// prominent banner in the email ("Call time changed", etc.) — but the
// default is a general update with the full gig info.
export function SendUpdateButton({ gigId }: { gigId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState("");

  function send() {
    startTransition(async () => {
      const res = await fetch(`/api/gigs/${gigId}/fanout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerLabel: label.trim() || undefined,
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
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
          if (e.key === "Escape") {
            setConfirming(false);
            setLabel("");
          }
        }}
        placeholder="Optional: what changed? e.g. Call time moved to 7pm"
        className="w-[300px] rounded-md border border-line-strong bg-paper px-3 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
      />
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
        }}
        className="text-[11px] text-ink-mute hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

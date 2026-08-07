"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendGigInvite } from "@/lib/actions/gig-invites";

// Per-musician "Invite to gig" affordance for the Payout Worksheet.
// Renders a compact status chip alongside a button whose label maps
// to state:
//
//   Never invited         →  [ Invite ]
//   Invited, no response  →  Invited [date] · [ Resend ]
//   Accepted              →  ✓ Accepted [date] · [ Resend ]
//   Declined              →  ✗ Declined [date] · [ Invite again ]
//
// Fires sendGigInvite() through useTransition so the button disables
// while the Resend send is in flight — no double-click duplication.
export function GigInviteButton({
  personnelId,
  musicianHasEmail,
  invitedAt,
  respondedAt,
  response,
}: {
  personnelId: string;
  musicianHasEmail: boolean;
  invitedAt: Date | string | null;
  respondedAt: Date | string | null;
  response: string | null; // "accepted" | "declined" | null
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function invite() {
    startTransition(async () => {
      try {
        await sendGigInvite(personnelId);
        router.refresh();
      } catch (err) {
        alert(
          err instanceof Error
            ? err.message
            : "Couldn't send the invite — try again in a moment.",
        );
      }
    });
  }

  if (!musicianHasEmail) {
    return (
      <span
        className="text-[10px] italic text-ink-mute"
        title="Add an email to this musician's roster row to enable gig invites"
      >
        no email
      </span>
    );
  }

  const fmt = (d: Date | string | null) => {
    if (!d) return "";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  let chip: React.ReactNode = null;
  let buttonLabel = "Invite";
  if (response === "accepted") {
    chip = (
      <span className="whitespace-nowrap text-[10px] font-semibold text-success">
        ✓ Accepted {fmt(respondedAt)}
      </span>
    );
    buttonLabel = "Resend";
  } else if (response === "declined") {
    chip = (
      <span className="whitespace-nowrap text-[10px] font-semibold text-accent">
        ✗ Declined {fmt(respondedAt)}
      </span>
    );
    buttonLabel = "Invite again";
  } else if (invitedAt) {
    chip = (
      <span className="whitespace-nowrap text-[10px] italic text-ink-mute">
        Invited {fmt(invitedAt)}
      </span>
    );
    buttonLabel = "Resend";
  }

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {chip}
      <button
        type="button"
        onClick={invite}
        disabled={pending}
        className="rounded border border-line-strong bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft transition-colors hover:border-accent hover:bg-accent hover:text-paper disabled:opacity-50"
        title="Send this musician an email with Accept / Decline buttons for this gig"
      >
        {pending ? "…" : buttonLabel}
      </button>
    </span>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Toggle a single guest's approval on a GigPersonnel row. Called from
// the bandleader's gig detail page when they tick/untick the checkbox
// next to a guest name. Authorization: must be the gig's owner (the
// bandleader). Musicians never call this — their input writes to
// guestList instead, which the bandleader sees and selectively
// approves from.
//
// The `name` is the exact line string the musician typed
// ("Sarah Smith +1"). Storing the literal string (rather than an
// index into guestList) keeps approvals attached to actual names
// even when the musician edits unrelated lines.
//
// Side effect: when the approval state actually flips, fires a tiny
// notification to the affected musician — email if notifyByEmail is
// on, SMS if notifyBySms is on AND the messaging service is configured.
// Done in the background; failure here doesn't block the DB write.
export async function toggleGuestApproval(
  personnelId: string,
  name: string,
  approved: boolean,
) {
  const user = await requireUser();

  // Confirm the bandleader owns the gig this personnel row belongs to.
  // Pull enough musician + gig info to send the notification without a
  // second round-trip.
  const personnel = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
    select: {
      id: true,
      gigId: true,
      approvedGuests: true,
      musician: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          notifyByEmail: true,
          notifyBySms: true,
          isLeader: true,
        },
      },
      gig: {
        select: {
          startAt: true,
          eventName: true,
          venue: { select: { name: true } },
          owner: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!personnel) {
    throw new Error("Not your gig");
  }

  const trimmed = name.trim();
  if (trimmed === "") return;

  const current = new Set(personnel.approvedGuests);
  if (approved) {
    current.add(trimmed);
  } else {
    current.delete(trimmed);
  }

  await db.gigPersonnel.update({
    where: { id: personnelId },
    data: { approvedGuests: Array.from(current) },
  });

  // Invalidate both the bandleader's gig page AND the musicians' own
  // per-gig page so anyone who refreshes either side sees the latest
  // approval state. Without the /my-gigs/[id] revalidate, the
  // musician's cached render could keep showing "Pending" for a
  // name the bandleader just confirmed.
  revalidatePath(`/gigs/${personnel.gigId}`);
  revalidatePath(`/my-gigs/${personnel.gigId}`);

  // ── Notify the affected musician ────────────────────────────────
  // Only when the state actually flipped (would the action have
  // changed approvedGuests?), and only when the musician opted into
  // notifications. Skip for leader's own rows (they're the approver,
  // notifying themselves is noise). Failure is swallowed: never block
  // the DB write on a flaky outbound email/SMS.
  const wasPreviouslyApproved = personnel.approvedGuests.includes(trimmed);
  const didFlip = wasPreviouslyApproved !== approved;
  if (didFlip && !personnel.musician.isLeader) {
    void notifyMusicianOfApprovalChange({
      personnel,
      guestName: trimmed,
      approved,
    }).catch((err) => {
      console.error("[guest-approval] notification failed", err);
    });
  }
}

// Fires email and/or SMS to the musician whose guest just had its
// approval state toggled. Mirrors the sender pattern used by lib/fanout.ts
// — friendly From line, bandleader's reply-to, plain language, transactional
// tone. Never throws into the caller's path; surfaces failures via the
// caller's catch and otherwise stays quiet.
async function notifyMusicianOfApprovalChange(opts: {
  personnel: {
    musician: {
      name: string;
      email: string | null;
      phone: string | null;
      notifyByEmail: boolean;
      notifyBySms: boolean;
    };
    gig: {
      startAt: Date;
      eventName: string | null;
      venue: { name: string } | null;
      owner: { name: string | null; email: string | null };
    };
  };
  guestName: string;
  approved: boolean;
}): Promise<void> {
  const { personnel, guestName, approved } = opts;
  const m = personnel.musician;
  const g = personnel.gig;
  const leader = g.owner.name ?? g.owner.email?.split("@")[0] ?? "Your bandleader";
  const venue = g.venue?.name ?? "the gig";
  const dateLabel = g.startAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const placeLabel = g.eventName ? `${g.eventName} · ${venue}` : venue;
  const verb = approved ? "confirmed" : "removed";

  // ── Email ────────────────────────────────────────────────────────
  if (m.notifyByEmail && m.email) {
    try {
      const apiKey = process.env.AUTH_RESEND_KEY;
      const fromAddr = process.env.EMAIL_FROM ?? "gigs@gigwright.com";
      if (apiKey) {
        const from = `"${leader} via GigWright" <${fromAddr}>`;
        const replyTo = g.owner.email ?? undefined;
        const subject = `Guest ${approved ? "confirmed" : "removed"}: ${guestName} — ${placeLabel} ${dateLabel}`;
        const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F3EFE6;font-family:-apple-system,system-ui,sans-serif;color:#0E0C09;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:24px">
  <p style="margin:0 0 12px;font-size:14.5px;color:#494336">Hi ${escapeHtml(m.name.split(" ")[0])},</p>
  <p style="margin:0 0 12px;font-size:15px;color:#111;line-height:1.5">
    ${escapeHtml(leader)} ${verb} <strong>${escapeHtml(guestName)}</strong> for ${escapeHtml(placeLabel)} on ${escapeHtml(dateLabel)}.
  </p>
  <p style="margin:16px 0 0;font-size:12px;color:#857F72;line-height:1.5">
    See your full list and current status on your gig page.
  </p>
</div></body></html>`;
        const text = `Hi ${m.name.split(" ")[0]},\n\n${leader} ${verb} ${guestName} for ${placeLabel} on ${dateLabel}.\n\n— GigWright`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: m.email,
            ...(replyTo ? { reply_to: replyTo } : {}),
            subject,
            html,
            text,
          }),
        });
      }
    } catch (err) {
      console.error("[guest-approval] email send failed", err);
    }
  }

  // ── SMS ──────────────────────────────────────────────────────────
  if (m.notifyBySms && m.phone) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const msgSvc = process.env.TWILIO_MESSAGING_SERVICE_SID;
      const fromNum = process.env.TWILIO_PHONE_NUMBER;
      if (sid && token && (msgSvc || fromNum)) {
        const body = `${leader}: ${approved ? "✓ Confirmed" : "Removed"} ${guestName} for ${placeLabel} ${dateLabel}. Reply STOP to opt out.`;
        const form = new URLSearchParams();
        form.set("To", normalizePhone(m.phone));
        form.set("Body", body);
        if (msgSvc) form.set("MessagingServiceSid", msgSvc);
        else if (fromNum) form.set("From", fromNum);
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization:
                "Basic " +
                Buffer.from(`${sid}:${token}`).toString("base64"),
            },
            body: form.toString(),
          },
        );
      }
    } catch (err) {
      console.error("[guest-approval] sms send failed", err);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

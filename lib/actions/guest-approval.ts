"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 2-minute debounce window. Bandleader has this long to undo or change
// their mind before the email/SMS goes out. Captured here so the
// processor and the action share the same value.
const NOTIFY_DELAY_MS = 2 * 60 * 1000;

// Toggle a single guest's approval on a GigPersonnel row. Called from
// the bandleader's gig detail page when they tick/untick the checkbox
// next to a guest name.
//
// Side effect: instead of firing the notification right away, enqueues
// it in PendingGuestNotification with a 2-minute delay. Rapid toggling
// within the window updates the pendingState on the existing row but
// preserves the original initialState — so if the bandleader ticks,
// then unticks 30 seconds later, the row resolves to "no net change"
// at fire time and no message is sent. Whenever an action runs, we
// also process any due notifications inline, so consecutive toggles
// across multiple guests drain naturally even without a cron.
export async function toggleGuestApproval(
  personnelId: string,
  name: string,
  approved: boolean,
) {
  const user = await requireUser();

  const personnel = await db.gigPersonnel.findFirst({
    where: { id: personnelId, gig: { ownerId: user.id } },
    select: {
      id: true,
      gigId: true,
      approvedGuests: true,
      musician: { select: { isLeader: true } },
    },
  });
  if (!personnel) {
    throw new Error("Not your gig");
  }

  const trimmed = name.trim();
  if (trimmed === "") return;

  const wasPreviouslyApproved = personnel.approvedGuests.includes(trimmed);
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

  revalidatePath(`/gigs/${personnel.gigId}`);
  revalidatePath(`/my-gigs/${personnel.gigId}`);

  // Process any pending notifications that have come due before we
  // enqueue this one. Cheap, and keeps a steady drumbeat of toggling
  // resolving the queue without needing a separate cron at all.
  void processDuePendingNotifications().catch((err) => {
    console.error("[guest-approval] processDue failed", err);
  });

  // Skip the leader's own approvals — notifying themselves is noise.
  if (personnel.musician.isLeader) return;

  // Upsert the pending row. If one already exists (i.e. the same guest
  // was toggled in the last 2 minutes), keep the original initialState
  // but update pendingState to the new value. The scheduledFor stays
  // pinned to the FIRST toggle's window, so the notification still
  // fires 2 minutes after the first interaction — not perpetually
  // delayed by rapid clicking.
  const existing = await db.pendingGuestNotification.findUnique({
    where: { personnelId_guestName: { personnelId, guestName: trimmed } },
    select: { id: true, initialState: true, scheduledFor: true },
  });
  if (existing) {
    await db.pendingGuestNotification.update({
      where: { id: existing.id },
      data: { pendingState: approved },
    });
  } else {
    await db.pendingGuestNotification.create({
      data: {
        personnelId,
        guestName: trimmed,
        initialState: wasPreviouslyApproved,
        pendingState: approved,
        scheduledFor: new Date(Date.now() + NOTIFY_DELAY_MS),
      },
    });
  }
}

// Find and fire any pending notifications whose scheduledFor is now or
// in the past. Skips rows where the net state didn't change (tick
// then untick back to the original) — those rows are deleted without
// a notification fired. Exported so the cron route and inline calls
// can both reach it.
export async function processDuePendingNotifications(): Promise<void> {
  const due = await db.pendingGuestNotification.findMany({
    where: { scheduledFor: { lte: new Date() } },
    include: {
      personnel: {
        select: {
          id: true,
          musician: {
            select: {
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
      },
    },
    take: 50, // bounded so a backlog can't blow up one call
  });

  for (const row of due) {
    try {
      // Net state changed? If not, no notification.
      const changed = row.initialState !== row.pendingState;
      if (changed && !row.personnel.musician.isLeader) {
        await notifyMusicianOfApprovalChange({
          personnel: row.personnel,
          guestName: row.guestName,
          approved: row.pendingState,
        });
      }
    } catch (err) {
      console.error("[guest-approval] notify failed", err);
    } finally {
      // Always delete — leaving the row would cause repeat sends on
      // every cron tick.
      try {
        await db.pendingGuestNotification.delete({ where: { id: row.id } });
      } catch (err) {
        console.error("[guest-approval] delete pending failed", err);
      }
    }
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

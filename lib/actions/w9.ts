"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

// Send a one-off W-9 request email to a musician. Used by the "Request" button
// on the roster page when the musician has an email but their W-9 isn't yet
// marked received. Also bumps Musician.w9RequestedAt so we can show "Requested
// [date]" in the UI and avoid accidental re-spamming.
export async function requestW9(musicianId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const user = await requireUser();
  const m = await db.musician.findFirst({
    where: { id: musicianId, ownerId: user.id },
    include: { owner: { select: { name: true, email: true } } },
  });
  if (!m) return { sent: false, reason: "Musician not found" };
  if (!m.email) return { sent: false, reason: "No email on file" };
  if (m.w9Received) return { sent: false, reason: "W-9 already received" };

  const apiKey = process.env.AUTH_RESEND_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  if (!apiKey) return { sent: false, reason: "Email not configured" };

  const leader =
    m.owner?.name ??
    (m.owner?.email ? m.owner.email.split("@")[0] : "Your bandleader");
  const leaderEmail = m.owner?.email ?? "";
  const firstName = m.name.split(/\s+/)[0] || m.name;
  const subject = `W-9 request from ${leader} — for 1099-NEC filings`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `${leader} is asking for a W-9 from you so you can get a proper 1099-NEC at`,
    `the end of the year. It's a one-page IRS form — fill it out once and`,
    `you're set.`,
    ``,
    `Download the blank form from the IRS here:`,
    `https://www.irs.gov/pub/irs-pdf/fw9.pdf`,
    ``,
    `Fill it out and reply to this email with the completed PDF, or email it`,
    `directly to ${leaderEmail || "your bandleader"}.`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Sent via GigWright, on behalf of ${leader}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:18px;font-weight:500;letter-spacing:-0.02em;padding-bottom:14px;border-bottom:1px solid #E5E2D8;color:#111">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.02em;line-height:1.2;margin:20px 0 6px;color:#111">
        W-9 request from ${escapeHtml(leader)}
      </h1>
      <p style="font-size:14px;color:#494336;line-height:1.55;margin:16px 0 0">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="font-size:14px;color:#494336;line-height:1.55;margin:12px 0 0">
        ${escapeHtml(leader)} is asking for a W-9 from you so you can get a
        proper 1099-NEC at the end of the year. It&rsquo;s a one-page IRS form
        &mdash; fill it out once and you&rsquo;re set.
      </p>
      <p style="margin:24px 0 8px">
        <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" style="display:inline-block;background:#7E2418;color:#FBFAF6;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
          Download blank W-9 (IRS)
        </a>
      </p>
      <p style="font-size:13px;color:#494336;line-height:1.55;margin:16px 0 0">
        Fill it out and reply to this email with the completed PDF, or send it
        directly to <a href="mailto:${escapeHtml(leaderEmail)}" style="color:#7E2418">${escapeHtml(leaderEmail || "your bandleader")}</a>.
      </p>
      <p style="font-size:12px;color:#857F72;line-height:1.5;margin:24px 0 0;padding-top:16px;border-top:1px solid #E5E2D8">
        Sent via GigWright, on behalf of <strong>${escapeHtml(leader)}</strong>.
      </p>
    </div>
  </body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: m.email,
      subject,
      text,
      html,
      reply_to: leaderEmail || undefined,
    }),
  });
  if (!res.ok) {
    return { sent: false, reason: `Resend ${res.status}` };
  }

  // Stamp the request time so we can show "Requested [date]" and avoid
  // repeat-spamming.
  await db.musician.update({
    where: { id: musicianId },
    data: { w9RequestedAt: new Date() },
  });

  revalidatePath("/roster");
  return { sent: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

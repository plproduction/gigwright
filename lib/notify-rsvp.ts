// Send an email to the bandleader when a musician accepts or declines
// their gig invite. Called inline from the RSVP route after the
// response is recorded. Wrapped in try/catch so a Resend hiccup can't
// prevent the response from landing or the confirmation page from
// rendering — the DB state is the source of truth, the email is a
// nicety.

import { db } from "@/lib/db";

export async function notifyBandleaderOfRsvp(personnelId: string) {
  try {
    const personnel = await db.gigPersonnel.findUnique({
      where: { id: personnelId },
      include: {
        musician: { select: { name: true } },
        gig: {
          include: {
            venue: { select: { name: true } },
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!personnel) return;
    if (!personnel.response) return;
    if (!personnel.gig.owner.email) return;

    const musicianName = personnel.musician.name;
    const venueName = personnel.gig.venue?.name ?? "TBD";
    const eventName = personnel.gig.eventName ?? "";
    const gigLabel = eventName ? `${eventName} at ${venueName}` : venueName;
    const gigDate = personnel.gig.startAt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const respondedFacet =
      personnel.response === "accepted" ? "accepted" : "declined";
    const emoji = personnel.response === "accepted" ? "✓" : "✗";

    const baseUrl = process.env.AUTH_URL ?? "https://gigwright.com";
    const gigUrl = `${baseUrl}/gigs/${personnel.gigId}`;

    // Bare address extraction — mirror the fix from the roster-invite
    // path (commit 91491e1) so a display-name-in-EMAIL_FROM can't
    // produce a nested-brackets 422 from Resend.
    const emailFromRaw = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const fallbackFrom =
      emailFromRaw.match(/<([^>]+)>/)?.[1]?.trim() ?? emailFromRaw.trim();
    const from = `"GigWright" <${fallbackFrom}>`;

    const subject =
      personnel.response === "accepted"
        ? `${emoji} ${musicianName} accepted — ${gigLabel} · ${gigDate}`
        : `${emoji} ${musicianName} DECLINED — ${gigLabel} · ${gigDate}`;

    const text = `${musicianName} ${respondedFacet} the ${gigDate} gig at ${gigLabel}.

Open the gig sheet: ${gigUrl}
${
  personnel.response === "declined"
    ? `
Heads up — you'll want to backfill this slot or reach out directly to see if they can flex.`
    : ""
}
Sent automatically when a musician responds to a gig invite.
`;

    const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;padding-bottom:16px;border-bottom:1px solid #E5E2D8;">
        Gig<span style="color:#7E2418;font-weight:300">Wright</span>
      </div>
      <p style="margin:20px 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${personnel.response === "accepted" ? "#2E6B3B" : "#7E2418"};">
        ${emoji} ${respondedFacet.toUpperCase()}
      </p>
      <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:22px;font-weight:400;color:#0E0C09;">
        ${escapeHtml(musicianName)}
      </p>
      <p style="margin:0 0 20px 0;font-size:14px;color:#3A3833;">
        ${escapeHtml(gigLabel)} &middot; ${escapeHtml(gigDate)}
      </p>
      ${
        personnel.response === "declined"
          ? `<p style="margin:0 0 20px 0;padding:12px 14px;background:#F9EFEC;border-left:3px solid #7E2418;font-size:13px;color:#3A3833;">You'll want to backfill this slot or reach out directly to see if they can flex.</p>`
          : ""
      }
      <div style="margin:24px 0;">
        <a href="${gigUrl}" style="display:inline-block;background:#0E0C09;color:#FFFFFF;padding:10px 20px;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">
          Open the gig sheet
        </a>
      </div>
      <p style="margin:24px 0 0 0;font-size:11px;color:#7A776E;font-style:italic;">
        Sent automatically when a musician responds to a gig invite.
      </p>
    </div>
  </body>
</html>`;

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) return;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: personnel.gig.owner.email,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[rsvp-notify] Resend ${res.status} owner=${personnel.gig.owner.id} body=${body}`,
      );
    } else {
      console.log(
        `[rsvp-notify] sent to owner=${personnel.gig.owner.id} musician=${musicianName} response=${personnel.response}`,
      );
    }
  } catch (err) {
    console.error(`[rsvp-notify] threw:`, err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

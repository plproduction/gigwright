// Shared client-portal email helper used by sendContract and
// sendInvoice. Centralises the From-header handling (same display-
// name-strip fix we applied to the roster-invite endpoint on
// 2026-08-06), Reply-To (bandleader's own email, so client replies
// reach the person they asked for the gig), and error handling
// (throw instead of silently swallow — if the client doesn't get
// the email, the admin needs to know).
//
// Called inline from the server action; the DB status write happens
// first so even if Resend fails the invoice/contract is marked SENT
// and the admin can copy the link manually. The thrown error
// surfaces as a server-action rejection so the UI can show a toast.

type SendClientEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  bandleaderName: string;
  bandleaderReplyEmail: string | null;
};

export async function sendClientPortalEmail(
  args: SendClientEmailArgs,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Email sending not configured (missing AUTH_RESEND_KEY).",
    };
  }

  // EMAIL_FROM may be set as either a bare address (gigs@gigwright.com)
  // or already as a display-name-wrapped header ('"Patrick" <gigs@...>').
  // Normalize to the bare address and re-wrap ourselves so we always
  // get a consistent, RFC-5322-valid From. This is the same shape fix
  // from commit 91491e1 that unblocked Debbie's roster invites.
  const emailFromRaw = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const bareFrom =
    emailFromRaw.match(/<([^>]+)>/)?.[1]?.trim() ?? emailFromRaw.trim();
  const displayName = args.bandleaderName.replace(/"/g, '\\"');
  const from = `"${displayName} via GigWright" <${bareFrom}>`;

  const body = {
    from,
    to: args.to,
    ...(args.bandleaderReplyEmail
      ? { reply_to: args.bandleaderReplyEmail }
      : {}),
    subject: args.subject,
    html: args.html,
    text: args.text,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[client-portal-email] FAILED status=${res.status} to=${maskEmail(args.to)} body=${errText}`,
      );
      return { ok: false, error: `Resend ${res.status}: ${errText}` };
    }
    const okJson = (await res.json().catch(() => ({}))) as { id?: string };
    console.log(
      `[client-portal-email] sent to=${maskEmail(args.to)} resendId=${okJson.id ?? "unknown"}`,
    );
    return { ok: true, id: okJson.id ?? "" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[client-portal-email] threw to=${maskEmail(args.to)} err=${msg}`,
    );
    return { ok: false, error: msg };
  }
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  return email.slice(0, 2) + "***" + email.slice(at);
}

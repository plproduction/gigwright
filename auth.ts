import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import authConfig from "./auth.config";

// Full auth (Node runtime). Adds the Prisma adapter for user/token storage
// and the Resend magic-link provider for sign-in emails.
//
// JWT callback also performs musician auto-linking on first sign-in:
// if the email matches any Musician record, we mark this User as MUSICIAN
// and attach every matching Musician row across all tenants to them. This
// is the viral-growth hook (one Dave account → every bandleader's gig list).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in
      if (user?.id && user.email) {
        const email = user.email.toLowerCase();
        const existing = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        // Don't demote an ADMIN back to MUSICIAN if they also happen
        // to be on someone's roster. Admins stay as-is.
        if (existing && existing.role === "ADMIN") {
          token.role = existing.role;
        } else {
          const matches = await db.musician.findMany({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true },
          });
          if (matches.length > 0) {
            await db.$transaction([
              db.user.update({
                where: { id: user.id },
                data: { role: "MUSICIAN" },
              }),
              db.musician.updateMany({
                where: { id: { in: matches.map((m) => m.id) } },
                data: { userId: user.id },
              }),
            ]);
            token.role = "MUSICIAN";
          } else {
            token.role = existing?.role ?? "OWNER";
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  providers: [
    Resend({
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier: email, url, provider }) {
        // In development, skip sending a real email and print the magic link
        // straight to the server logs. Makes local iteration fast, doesn't
        // burn Resend sends.
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `\n╭─ Gigwright magic link ─────────────────────────────╮\n│  to: ${email}\n│  ${url}\n╰────────────────────────────────────────────────────╯\n`,
          );
          return;
        }

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            from: provider.from,
            to: email,
            subject: "Your GigWright sign-in link",
            text: [
              `Tap the link below to sign in to GigWright.`,
              `This link is good for 24 hours and can only be used once.`,
              ``,
              url,
              ``,
              `If you didn't request this, you can ignore this email — no account was created.`,
              ``,
              `— GigWright (Patrick Lamb Productions, Palm Beach FL)`,
            ].join("\n"),
            html: gigwrightSignInEmail(url, email),
          }),
        });
        if (!res.ok) {
          throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
        }
      },
    }),
  ],
});

function gigwrightSignInEmail(url: string, email: string) {
  const safeUrl = escapeHtml(url);
  const safeEmail = escapeHtml(email);
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#F3EFE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0E0C09;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #EDE7DA;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:-0.02em;color:#0E0C09;">
            Gig<span style="color:#7E2418;font-weight:300">Wright</span>
          </div>
          <div style="margin-top:2px;font-size:11px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:#857F72;">
            Sign-in link
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 20px 32px;">
          <h1 style="margin:0 0 10px 0;font-family:Georgia,serif;font-size:26px;font-weight:400;letter-spacing:-0.02em;line-height:1.15;color:#0E0C09;">
            Tap to sign in.
          </h1>
          <p style="margin:0 0 22px 0;color:#494336;font-size:14.5px;line-height:1.6;">
            Click the button below to sign in to GigWright as
            <strong style="color:#0E0C09">${safeEmail}</strong>. This link is
            good for 24 hours and can only be used once.
          </p>
          <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;background:#7E2418;color:#FBFAF6;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.005em;">
            Sign in to GigWright  &rarr;
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px 32px;">
          <div style="margin-top:8px;padding:16px;background:#FBFAF6;border:1px solid #EDE7DA;border-radius:8px;">
            <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#857F72;margin-bottom:6px;">
              Link not working?
            </div>
            <div style="font-size:12.5px;line-height:1.55;color:#494336;word-break:break-all;">
              Copy and paste this URL into your browser:<br/>
              <span style="color:#7E2418">${safeUrl}</span>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px 28px 32px;border-top:1px solid #EDE7DA;">
          <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#494336;">
            Didn&rsquo;t request this? You can safely ignore this email &mdash;
            no account was created.
          </p>
          <p style="margin:8px 0 0 0;font-size:11px;line-height:1.5;color:#857F72;">
            GigWright &middot; Patrick Lamb Productions &middot; Palm Beach, Florida
            <br/>
            <a href="https://www.gigwright.com" style="color:#857F72;text-decoration:underline">www.gigwright.com</a>
            &nbsp;&middot;&nbsp;
            <a href="mailto:hello@gigwright.com" style="color:#857F72;text-decoration:underline">hello@gigwright.com</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

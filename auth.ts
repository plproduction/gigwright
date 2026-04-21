import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import authConfig from "./auth.config";

// Full auth (Node runtime). Adds the Prisma adapter for user/token storage
// and the Resend magic-link provider for sign-in emails.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
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
            subject: "Sign in to Gigwright",
            text: `Sign in to Gigwright:\n${url}\n\nThis link expires in 24 hours. If you didn't request it, you can ignore this email.`,
            html: gigwrightSignInEmail(url),
          }),
        });
        if (!res.ok) {
          throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
        }
      },
    }),
  ],
});

function gigwrightSignInEmail(url: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px;background:#F3EFE6;font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;color:#0E0C09;">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.10);border-radius:10px;padding:32px;">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:500;letter-spacing:-0.02em;padding-bottom:16px;border-bottom:1px solid #E5E2D8;">
        Gig<span style="color:#7E2418;font-weight:300">wright</span>
      </div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-0.02em;line-height:1.15;margin:24px 0 8px;">
        Your sign-in link
      </h1>
      <p style="color:#494336;font-size:14px;line-height:1.5;margin:0 0 24px;">
        Tap the button to finish signing in. This link is good for 24 hours.
      </p>
      <a href="${url}" style="display:inline-block;padding:12px 20px;background:#7E2418;color:#FBFAF6;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
        Sign in to Gigwright
      </a>
      <p style="color:#857F72;font-size:12px;line-height:1.5;margin:28px 0 0;padding-top:16px;border-top:1px solid #E5E2D8;">
        If the button doesn&rsquo;t work, copy and paste this URL into your browser:<br/>
        <span style="word-break:break-all;color:#494336">${url}</span>
      </p>
    </div>
  </body>
</html>`;
}

import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { NextResponse } from "next/server";

// proxy.ts runs in the Node runtime (Next 16 rename of middleware.ts).
// We still use the lean auth.config to keep this file fast on every request —
// session is verified via the JWT cookie without touching Postgres.
const { auth } = NextAuth(authConfig);

export default auth(function proxy(req) {
  const { pathname } = req.nextUrl;

  // Referral cookie handoff — if the incoming request has ?ref=CODE,
  // stash it in a 30-day cookie so the eventual signup flow can
  // attribute the new user to the referrer. Runs BEFORE the auth
  // gate so it works whether the visitor is signed in or not (they
  // might click a referral link while already logged in and share
  // it with a friend from the same tab). See lib/actions/referrals.ts
  // for the redemption side.
  const refCode = req.nextUrl.searchParams.get("ref");
  if (refCode && /^[a-f0-9]{4,32}$/.test(refCode)) {
    const res = NextResponse.next();
    res.cookies.set("gw_ref", refCode, {
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    // Still enforce the auth gate below — don't early-return here,
    // just persist the cookie on the response object we'll return.
    if (!req.auth && !pathIsPublic(pathname)) {
      const signInUrl = new URL("/signin", req.nextUrl.origin);
      signInUrl.searchParams.set("callbackUrl", pathname);
      const redirect = NextResponse.redirect(signInUrl);
      redirect.cookies.set("gw_ref", refCode, {
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      });
      return redirect;
    }
    return res;
  }

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/changelog") ||
    // SMS compliance pages — these MUST be publicly accessible so TCR and
    // carrier reviewers can verify the Call to Action. Two prior A2P 10DLC
    // rejections were traced back to this very file: /sms-consent (the
    // policy) and /sms-opt-in (the public form) were auth-gated, so the
    // TCR reviewer clicked the CTA URL we gave them, got bounced to
    // /signin, and rejected the campaign with "issues verifying the Call
    // to Action." Never auth-gate these.
    pathname.startsWith("/sms-consent") ||
    pathname.startsWith("/sms-opt-in") ||
    // Public read-only gig pages for SMS/email click-throughs
    pathname.startsWith("/g/") ||
    // Calendar subscription feeds. The token in the URL IS the
    // authorization — calendar apps (Apple Calendar, Google Calendar,
    // Outlook) can't perform an OAuth sign-in, so we authenticate via
    // the unguessable 128-bit token instead. Must be public so the
    // calendar app's polling requests land without a /signin bounce.
    pathname.startsWith("/cal/") ||
    pathname.startsWith("/api/") || // API routes handle their own auth (cron routes are secret-gated)
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // Static verification files served from public/ (Google Search Console,
    // Apple Pay domain verification, etc.)
    pathname.startsWith("/google") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/site.webmanifest" ||
    // Next metadata routes (icon, apple-icon, opengraph-image, twitter-image)
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image");

  if (!req.auth && !isPublic) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

// Extracted so the referral-cookie branch above can reuse the same
// public-path list — kept in sync with the inline check below.
function pathIsPublic(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/changelog") ||
    pathname.startsWith("/sms-consent") ||
    pathname.startsWith("/sms-opt-in") ||
    pathname.startsWith("/g/") ||
    pathname.startsWith("/cal/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { NextResponse } from "next/server";

// proxy.ts runs in the Node runtime (Next 16 rename of middleware.ts).
// We still use the lean auth.config to keep this file fast on every request —
// session is verified via the JWT cookie without touching Postgres.
const { auth } = NextAuth(authConfig);

export default auth(function proxy(req) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/changelog") ||
    // Public read-only gig pages for SMS/email click-throughs
    pathname.startsWith("/g/") ||
    pathname.startsWith("/api/") || // API routes handle their own auth
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

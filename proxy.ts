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
    pathname.startsWith("/api/") || // API routes handle their own auth
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

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

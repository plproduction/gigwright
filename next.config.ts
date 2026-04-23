import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canonical host is www.gigwright.com. The apex is temporarily flagged by
  // Google Safe Browsing while a false-positive review is pending, so any
  // traffic that lands on the apex gets a 302 over to www — EXCEPT the paths
  // that Google uses to re-verify ownership + crawl, which must continue to
  // serve at the apex for the review to resolve.
  async redirects() {
    return [
      {
        // Negative lookahead excluding the paths Google + infra reach for
        // directly: Search Console verification file, robots/sitemap,
        // /.well-known, API routes, and Next build assets.
        source: "/((?!google|robots\\.txt|sitemap\\.xml|\\.well-known|api|_next).*)",
        has: [{ type: "host", value: "gigwright.com" }],
        destination: "https://www.gigwright.com/:path*",
        permanent: false, // 302 — will flip back to apex once SB clears
      },
    ];
  },
};

export default nextConfig;

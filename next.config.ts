import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canonical host is gigwright.com (apex). Anything that lands on
  // www.gigwright.com gets a 307 redirect to the apex so there's exactly
  // one indexable URL and clean branding on every surface.
  async redirects() {
    return [
      {
        // Redirect every path on www → apex, except the verification +
        // metadata paths Google and infra need to reach directly at the host
        // they're checking.
        source: "/((?!google|robots\\.txt|sitemap\\.xml|\\.well-known|api|_next).*)",
        has: [{ type: "host", value: "www.gigwright.com" }],
        destination: "https://gigwright.com/:path*",
        permanent: false, // 307 — preserve method, leave room to reconsider
      },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";

// Next 16 native robots.txt. Allow the public landing + legal pages, disallow
// any authenticated app routes, API routes, and musician-specific subtrees.
// Points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms"],
        disallow: [
          "/api/",
          "/dashboard",
          "/gigs",
          "/roster",
          "/venues",
          "/finance",
          "/settings",
          "/welcome",
          "/my-gigs",
          "/my-profile",
        ],
      },
    ],
    sitemap: "https://www.gigwright.com/sitemap.xml",
    host: "https://www.gigwright.com",
  };
}

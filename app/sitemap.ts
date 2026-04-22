import type { MetadataRoute } from "next";

// Next 16 native sitemap. Lists only the public marketing/legal pages —
// every authenticated route is correctly excluded via robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://gigwright.com/",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://gigwright.com/privacy",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://gigwright.com/terms",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

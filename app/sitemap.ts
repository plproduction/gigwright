import type { MetadataRoute } from "next";

// Next 16 native sitemap. Lists only the public marketing/legal pages —
// every authenticated route is correctly excluded via robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://www.gigwright.com/",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.gigwright.com/about",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: "https://www.gigwright.com/changelog",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: "https://www.gigwright.com/privacy",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://www.gigwright.com/terms",
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

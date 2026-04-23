import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.gigwright.com"),
  title: {
    default: "GigWright · Booking management built by a working bandleader",
    template: "%s · GigWright",
  },
  description:
    "A playwright writes plays. A GigWright runs gigs. The bandleader's workbench — from the first call to the final payout. Two-way calendar sync, diff-aware SMS, QuickBooks push.",
  keywords: [
    "bandleader",
    "booking management",
    "gig management",
    "musician roster",
    "calendar sync",
    "iCloud",
    "SMS band updates",
    "QuickBooks for bands",
    "payout worksheet",
    "set list",
  ],
  applicationName: "GigWright",
  authors: [{ name: "Patrick Lamb Productions" }],
  creator: "Patrick Lamb Productions",
  publisher: "Patrick Lamb Productions",
  category: "Business",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.gigwright.com",
    siteName: "GigWright",
    title: "GigWright · Booking management built by a working bandleader",
    description:
      "A playwright writes plays. A GigWright runs gigs. The bandleader's workbench — from the first call to the final payout.",
  },
  twitter: {
    card: "summary_large_image",
    title: "GigWright · Booking management built by a working bandleader",
    description:
      "A playwright writes plays. A GigWright runs gigs. The bandleader's workbench — from the first call to the final payout.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: { canonical: "https://gigwright.com" },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}

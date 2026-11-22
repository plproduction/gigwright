import type { Metadata } from "next";
import { Fraunces, Inter, Cormorant_Garamond } from "next/font/google";
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

// Used only inside <ContractDocument> — Patrick's existing letterhead
// contract typography (white-stock performance agreements), kept
// separate from the app shell's Fraunces/cream-paper look. See
// docs/specs/ritz-carlton-contracts.md.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gigwright.com"),
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
    url: "https://gigwright.com",
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
      className={`${inter.variable} ${fraunces.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}

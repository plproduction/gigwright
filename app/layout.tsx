import type { Metadata } from "next";
import { Fraunces, Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

// Inter and Fraunces are both variable fonts. Naming explicit weights
// makes Google serve a separate static file per weight — seven files
// between them — and `next/font/google` fetches every one at BUILD
// time. Three deploys in a row died there ("Module not found:
// @vercel/turbopack-next/internal/font/google/font", which is how
// Turbopack reports a failed font fetch) once this repo started
// deploying several times an hour.
//
// Omitting `weight` fetches the variable file instead: one per family,
// every weight in the range still available. The app only asks for
// light/normal/medium/semibold, all well inside it, so nothing changes
// on screen. If this ever flakes again the bulletproof fix is
// self-hosting via next/font/local, which removes the network from the
// build entirely.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal"],
});

// Used only inside <ContractDocument> — Patrick's existing letterhead
// contract typography (white-stock performance agreements), kept
// separate from the app shell's Fraunces/cream-paper look. See
// docs/specs/ritz-carlton-contracts.md.
// Only 400 is ever used (the contract sets no weight on serif type), and
// italic appears in three places. Declaring 500 and 600 fetched four
// extra font files at build time for nothing — and every extra file is
// another chance for `next/font/google` to fail the whole build when
// Google throttles the fetch, which is exactly what started happening
// once this repo was deploying several times an hour.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400"],
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";

const NAV = [
  { label: "Gigs", href: "/dashboard", matches: ["/dashboard", "/gigs"] },
  { label: "Roster", href: "/roster", matches: ["/roster"] },
  { label: "Venues", href: "/venues", matches: ["/venues"] },
  { label: "Producers", href: "/producers", matches: ["/producers"] },
  { label: "Finance", href: "/finance", matches: ["/finance"] },
  { label: "Settings", href: "/settings", matches: ["/settings"] },
];

export function AppNav({ userInitials }: { userInitials: string }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center bg-paper-warm px-4 py-[14px] border-b border-line md:px-6">
      <Link
        href="/dashboard"
        className="font-serif text-[17px] font-medium tracking-tight mr-4 shrink-0 md:mr-9"
      >
        Gig<em className="font-light text-accent">Wright</em>
      </Link>
      {/* Horizontally-scrollable on mobile so all nav items remain reachable
          when the viewport is narrower than the row's natural width — the
          shell's outer overflow-hidden was clipping Settings off the right
          edge with no scroll affordance. Native scrollbar hidden by the
          .scrollbar-hide utility so it doesn't add visual noise; the row
          still scrolls by drag/swipe on touch devices. */}
      <nav className="flex flex-1 min-w-0 gap-5 overflow-x-auto scrollbar-hide md:gap-6">
        {NAV.map((item) => {
          const active = item.matches.some(
            (m) => pathname === m || pathname.startsWith(m + "/"),
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 py-1.5 text-[14px] font-semibold border-b-2 transition-colors ${
                active
                  ? "text-ink border-accent"
                  : "text-ink border-transparent hover:text-accent hover:border-accent/40"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-3 flex shrink-0 items-center gap-[10px] md:ml-auto md:gap-[14px]">
        {/* GlobalSearch is hidden on phones — there's nowhere for it to
            fit, and the avatar in the corner already routes to settings. */}
        <div className="hidden md:block">
          <GlobalSearch />
        </div>
        <Link
          href="/settings"
          aria-label="Account"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
        >
          {userInitials}
        </Link>
      </div>
    </div>
  );
}

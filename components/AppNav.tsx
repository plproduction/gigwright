"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Gigs", href: "/dashboard", matches: ["/dashboard", "/gigs"] },
  { label: "Roster", href: "/roster", matches: ["/roster"] },
  { label: "Venues", href: "/venues", matches: ["/venues"] },
  { label: "Finance", href: "/finance", matches: ["/finance"] },
  { label: "Settings", href: "/settings", matches: ["/settings"] },
];

export function AppNav({ userInitials }: { userInitials: string }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center bg-paper-warm px-6 py-[14px] border-b border-line">
      <Link
        href="/dashboard"
        className="font-serif text-[17px] font-medium tracking-tight mr-9"
      >
        Gig<em className="font-light text-accent">wright</em>
      </Link>
      <nav className="flex gap-6">
        {NAV.map((item) => {
          const active = item.matches.some(
            (m) => pathname === m || pathname.startsWith(m + "/"),
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`py-1.5 text-[14px] font-semibold border-b-2 transition-colors ${
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
      <div className="ml-auto flex items-center gap-[14px]">
        <div className="relative w-[220px]">
          <input
            type="text"
            placeholder="Search gigs, venues, people…"
            className="w-full rounded-md border border-line bg-paper py-[7px] pl-[30px] pr-3 text-[12px] text-ink placeholder-ink-mute outline-none focus:border-accent"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-mute">
            ⌕
          </span>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "My gigs", href: "/my-gigs", matches: ["/my-gigs"] },
  { label: "My profile", href: "/my-profile", matches: ["/my-profile"] },
];

export function MusicianNav({ userInitials }: { userInitials: string }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center bg-paper-warm px-6 py-[14px] border-b border-line">
      <Link
        href="/my-gigs"
        className="font-serif text-[17px] font-medium tracking-tight mr-9"
      >
        Gig<em className="font-light text-accent">Wright</em>
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
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-mute">
          Musician
        </span>
        <Link
          href="/my-profile"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
        >
          {userInitials}
        </Link>
      </div>
    </div>
  );
}

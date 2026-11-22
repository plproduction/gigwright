// Small display helpers used across the app. Keep these pure so they can
// be called from server components without hydration issues.

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  if (dollars >= 1000) {
    return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

export function formatDayNum(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit" });
}

export function formatMonthAbbr(d: Date): string {
  // "Apr · Sat"
  const mo = d.toLocaleDateString("en-US", { month: "short" });
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${mo} · ${dow}`;
}

// True when a date doesn't fall in the year we're currently in.
//
// Every gig list in the app used to print "31 · DEC · FRI" with no year,
// which is fine for the 95% of rows inside the current year and actively
// misleading for the rest: a 2027 date read as this December, and because
// the lists sort by date, the tail of "19 DEC / 24 JUL / 31 DEC" looked
// like a sorting bug rather than next year's work. Patrick lost a test
// gig for a day because of it (2026-11-22). Year-when-it-differs keeps
// the common row short and makes the odd one honest.
export function isOtherYear(d: Date): boolean {
  return d.getFullYear() !== new Date().getFullYear();
}

// "Apr · Sat", or "Apr 2027 · Sat" when it isn't this year.
export function formatMonthAbbrSmart(d: Date): string {
  const mo = d.toLocaleDateString("en-US", { month: "short" });
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  return isOtherYear(d) ? `${mo} ${d.getFullYear()} · ${dow}` : `${mo} · ${dow}`;
}

// "Apr 12", or "Apr 12, 2027" when it isn't this year. For tight spots
// — stat chips, one-line notes — where the weekday doesn't earn room.
export function formatShortDateSmart(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isOtherYear(d) ? { year: "numeric" as const } : {}),
  });
}

// "Friday, December 31", or "Friday, December 31, 2027" when it isn't
// this year. For headings and hero cards.
export function formatLongDateSmart(d: Date): string {
  return isOtherYear(d) ? formatLongDateWithYear(d) : formatLongDate(d);
}

// Always carries the year. For anything that has to stand on its own
// away from the app — contracts above all, where "Friday, December 31"
// on a signed document is a defect, not a shorthand.
export function formatLongDateWithYear(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", " ");
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatYear(d: Date): string {
  return d.getFullYear().toString();
}

export function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isFuture(d: Date): boolean {
  return d.getTime() > Date.now();
}

export function personnelSummary(
  names: string[],
  maxShown = 3,
): string {
  if (names.length === 0) return "—";
  if (names.length <= maxShown) {
    return names.map(firstName).join(" · ");
  }
  const shown = names.slice(0, maxShown).map(firstName).join(" · ");
  return `${shown} + ${names.length - maxShown} more`;
}

function firstName(n: string): string {
  return n.split(/\s+/)[0] || n;
}

export function gigVenueLabel(venue: {
  name: string;
  city: string | null;
  state: string | null;
} | null): { name: string; sub: string } {
  if (!venue) return { name: "TBD", sub: "" };
  const locationParts = [venue.city, venue.state].filter(Boolean);
  return {
    name: venue.name,
    sub: locationParts.join(", "),
  };
}

// Canonical map link for a venue. Uses Google Maps search URL format so it
// opens in the user's native maps app (iOS asks Apple Maps vs. Google Maps;
// Android opens Google Maps directly). Works as a plain hyperlink in SMS,
// email, or the web UI — no URL scheme tricks needed.
export function mapLink(venue: {
  name?: string | null;
  addressL1?: string | null;
  addressL2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string | null {
  const parts = [
    venue.name,
    venue.addressL1,
    venue.addressL2,
    venue.city,
    venue.state,
    venue.postalCode,
  ].filter((s): s is string => !!s && s.trim() !== "");
  if (parts.length === 0) return null;
  const q = parts.join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(q)}`;
}

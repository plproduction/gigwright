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

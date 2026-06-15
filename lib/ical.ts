// Tiny .ics generator and helpers for the GigWright calendar feed. We
// hand-roll the format instead of pulling in `ical-generator` because the
// spec we need is tiny (VEVENT + a few standard fields) and a dependency
// adds 200KB to every server bundle for the privilege.

type IcsEvent = {
  uid: string; // stable identifier — must be the same across feed refreshes
  startAt: Date;
  endAt: Date | null; // optional end time
  summary: string;
  description?: string;
  location?: string;
  url?: string;
};

// Format a date as YYYYMMDDTHHMMSSZ — UTC, no separators. RFC 5545 DATETIME.
// All emitted times are UTC so the receiving calendar app handles the local
// timezone display correctly.
function formatIcsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

// Escape commas, semicolons, newlines per RFC 5545. Backslash is the
// escape char so it gets doubled.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Fold long lines per RFC 5545 — max 75 octets per line, continuation
// lines start with a single space. We approximate with characters since
// our content is mostly ASCII; non-ASCII fields (venue names, notes)
// would benefit from byte-counted folding if it becomes an issue.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 73);
    chunks.push(i === 0 ? chunk : " " + chunk);
    i += 73;
  }
  return chunks.join("\r\n");
}

export function buildIcsFeed(opts: {
  calendarName: string;
  description?: string;
  events: IcsEvent[];
  // Used for the PRODID line — anything identifying GigWright as the
  // generator. Receiving apps display it in their subscription manager.
  prodId?: string;
  now?: Date;
}): string {
  const dtstamp = formatIcsDate(opts.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${opts.prodId ?? "-//GigWright//Gig Calendar//EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`),
    ...(opts.description
      ? [foldLine(`X-WR-CALDESC:${escapeIcsText(opts.description)}`)]
      : []),
    // Refresh hint for clients that respect it (Apple Calendar, some
    // Outlook versions). 1 hour matches our typical fanout cadence — if
    // the bandleader changes a call time, the band's calendars catch up
    // within an hour rather than the default 24h+.
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const ev of opts.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatIcsDate(ev.startAt)}`);
    if (ev.endAt) {
      lines.push(`DTEND:${formatIcsDate(ev.endAt)}`);
    } else {
      // Default to a 2-hour duration when no end time is set, so the
      // event takes up reasonable real-estate on a calendar grid.
      const fallback = new Date(ev.startAt.getTime() + 2 * 60 * 60 * 1000);
      lines.push(`DTEND:${formatIcsDate(fallback)}`);
    }
    lines.push(foldLine(`SUMMARY:${escapeIcsText(ev.summary)}`));
    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcsText(ev.description)}`));
    }
    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(ev.location)}`));
    }
    if (ev.url) {
      lines.push(foldLine(`URL:${ev.url}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

// Generate a URL-safe random token for calendar subscription. 22 chars
// of base64url is 128 bits of entropy — enough to make the URL
// unguessable but not annoyingly long when the user pastes it into
// Apple Calendar's subscription dialog.
export function generateIcalToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return Buffer.from(str, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

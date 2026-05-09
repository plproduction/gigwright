// Email render functions, factored out of lib/fanout.ts so they can be
// rendered without pulling in Prisma, the database client, or the rest
// of the fanout machinery (e.g. for design preview via
// scripts/preview-email.mjs, or for unit tests).
//
// Pure: every function here is data-in / string-out. No side effects.

// ── templates ─────────────────────────────────────────────────

export type Ctx = {
  firstName: string;
  bandleader: string;
  triggerLabel?: string;
  message?: string; // bandleader's free-form note for this update
  gigId: string;
  venueName: string;
  venueAddress: string;
  mapLink: string | null;
  longDate: string;
  loadIn: string | null;
  soundcheck: string | null;
  soundcheckEnd: string | null;
  call: string | null;
  downbeat: string;
  finish: string | null;
  attire: string | null;
  loadingInfo: string | null;
  loadingMapLink: string | null;
  setlistUrl: string | null;
  setlistFileName: string | null;
  materialsUrl: string | null;
  notes: string | null;
  lineup: Array<{
    name: string;
    role: string | null;
    isLeader: boolean;
    phone: string | null;
  }>;
};

// Standard explanation for "Sound check" — always travels with the term so
// musicians know exactly what's expected at that time. Same wording in HTML
// and text emails so there's one source of truth.
const SOUNDCHECK_EXPLAINER =
  "all lines run, instruments set up, ready to play at this time";
// Roster names are sometimes lowercased ("patrick"). Rendered emails should
// always greet with proper case ("Patrick"). Handles unicode-safe first-char
// capitalization.
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

// Title-case a multi-word name while preserving internal punctuation
// (apostrophes in O'Brien, hyphens in Smith-Jones, etc.). Lowercased
// names like "patrick lamb" become "Patrick Lamb"; already-title-cased
// or unusually-cased names are left mostly intact (we only force the
// first letter of each whitespace-separated token).
//
// Used for the bandleader's name in the email body, footer, and on the
// envelope sender ("Patrick Lamb via GigWright" rather than the raw
// "patrick lamb via GigWright" coming straight out of the user record).
export function titleCaseName(s: string): string {
  if (!s) return s;
  return s
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) || part.length === 0
        ? part
        : part.charAt(0).toLocaleUpperCase() + part.slice(1),
    )
    .join("");
}

export function renderText(c: Ctx): string {
  const lines: string[] = [];
  lines.push(`Hi ${capitalize(c.firstName)},`);
  lines.push("");

  // The bandleader's message comes FIRST — that's the "new info" they're
  // pushing out, and it's what the band cares about most. The structural
  // gig details follow as a reference.
  if (c.message) {
    lines.push(c.message.trim());
    lines.push("");
    lines.push("───");
    lines.push("");
  } else if (c.triggerLabel) {
    lines.push(`Update from ${titleCaseName(c.bandleader)}: ${c.triggerLabel}.`);
    lines.push("");
  } else {
    lines.push(`Gig info from ${titleCaseName(c.bandleader)}:`);
    lines.push("");
  }

  // Meat and potatoes — date, venue, map.
  lines.push(`📅 ${c.longDate}`);
  lines.push(`📍 ${c.venueName}${c.venueAddress ? ` — ${c.venueAddress}` : ""}`);
  if (c.mapLink) lines.push(`   Map: ${c.mapLink}`);
  lines.push("");

  // Times. The soundcheck line ALWAYS includes the explainer so musicians
  // know what "soundcheck" means in this band's vocabulary.
  if (c.loadIn) lines.push(`Load in:     ${c.loadIn}`);
  if (c.soundcheck) {
    lines.push(`Sound check: ${c.soundcheck}`);
    lines.push(`             (${SOUNDCHECK_EXPLAINER})`);
  }
  if (c.soundcheckEnd) {
    lines.push(`Sound check complete: ${c.soundcheckEnd}`);
    lines.push(`             (band is freed up after this time)`);
  }
  if (c.call) lines.push(`Call:        ${c.call}`);
  lines.push(`Downbeat:    ${c.downbeat}`);
  if (c.finish) lines.push(`Finish:      ${c.finish}`);
  if (c.attire) {
    lines.push("");
    lines.push(`Attire: ${c.attire}`);
  }

  // Combined "Special loading info & notes" — merged single section.
  if (c.loadingInfo || c.loadingMapLink || c.notes) {
    lines.push("");
    lines.push(`Special loading info & notes:`);
    if (c.loadingInfo) lines.push(`  ${c.loadingInfo.replace(/\n/g, "\n  ")}`);
    if (c.notes) {
      if (c.loadingInfo) lines.push("");
      lines.push(`  ${c.notes.replace(/\n/g, "\n  ")}`);
    }
    if (c.loadingMapLink) {
      if (c.loadingInfo || c.notes) lines.push("");
      lines.push(`  Load-in map: ${c.loadingMapLink}`);
    }
  }

  // Set list + materials — ALWAYS show both. If a real URL is posted, link
  // to it directly; if not, point at the gig sheet so the band can refresh
  // there when the file lands.
  const gigSheetUrl = `https://gigwright.com/g/${c.gigId}`;
  lines.push("");
  if (c.setlistUrl) {
    lines.push(`Set list: ${c.setlistFileName ?? "Open set list"}`);
    lines.push(`  ${c.setlistUrl}`);
  } else {
    lines.push(`Set list: not yet posted — view gig sheet for updates`);
    lines.push(`  ${gigSheetUrl}`);
  }
  if (c.materialsUrl) {
    lines.push("");
    lines.push(`Gig materials folder:`);
    lines.push(`  ${c.materialsUrl}`);
  } else {
    lines.push("");
    lines.push(`Gig materials: not yet posted — view gig sheet for updates`);
    lines.push(`  ${gigSheetUrl}`);
  }

  // (notes is now merged into the combined loading info & notes section above.)

  // Lineup — who's on the gig. Phone numbers (when set) ride along on
  // an indented continuation line so band members can call/text each
  // other directly.
  if (c.lineup.length > 0) {
    lines.push("");
    lines.push(`Lineup:`);
    for (const m of c.lineup) {
      const tag = m.isLeader ? " (leader)" : "";
      const role = m.role ? ` — ${m.role}` : "";
      lines.push(`  • ${m.name}${role}${tag}`);
      if (m.phone) lines.push(`     ${m.phone}`);
    }
  }

  lines.push("");
  lines.push(`Full gig sheet (no login needed):`);
  lines.push(`https://gigwright.com/g/${c.gigId}`);
  lines.push("");
  lines.push(`— GigWright, on behalf of ${titleCaseName(c.bandleader)}`);
  return lines.join("\n");
}
export function renderHtml(c: Ctx): string {
  // Editorial layout — feels like a personal letter, not a system email.
  //   1. Wordmark header
  //   2. Eyebrow tag (GREETINGS / DOWNBEAT CHANGE / etc.) on its own line
  //   3. Greeting + bandleader's message in a quiet cream panel
  //   4. Venue name display (large Georgia) + date + address + map
  //   5. Schedule table with Downbeat highlighted as the main event
  //   6. Special loading info / notes (if present)
  //   7. Set list + materials as proper button-style CTAs
  //   8. Lineup as a refined list
  //   9. Footer with full-sheet link and "sent on behalf of" attribution
  // Every section uses the same restrained palette and breathing room so
  // the whole piece reads as one coherent, professional document.

  const ACCENT = "#7E2418";
  const INK = "#0E0C09";
  const INK_SOFT = "#4A453C";
  const INK_MUTE = "#8A8576";
  const LINE = "#E5E2D8";
  const LINE_SOFT = "#F0EBE0";
  const PAPER = "#F3EFE6";
  const PAPER_WARM = "#FAF6EC";
  const BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif";

  // Editorial-style "eyebrow" label — small caps in accent color. Used as
  // a section header throughout the email so each block has a quiet
  // wayfinder above it. Returns a <p> tag with its own margin reset so
  // callers don't have to wrap it.
  const eyebrow = (text: string) =>
    `<p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:11px;font-weight:700;letter-spacing:0.22em;color:${ACCENT};text-transform:uppercase;line-height:1.4">${escapeHtml(text)}</p>`;

  // ── Eyebrow / greeting block ───────────────────────────────────────
  const triggerHeading = c.triggerLabel
    ? `<tr><td style="padding:28px 32px 0">${eyebrow(c.triggerLabel)}</td></tr>`
    : "";

  // Greeting: when the bandleader wrote a custom note we wrap the whole
  // greeting in a soft cream panel so it reads like a personal letter.
  // The 2px accent rule on the left echoes the eyebrow color above the
  // panel without screaming. When there's no message, the cream panel
  // would just contain "Hi <name>," which looks lonely — so in that case
  // we render a plain salutation paragraph instead.
  const greetingRow = c.message
    ? `<tr><td style="padding:${c.triggerLabel ? "4px" : "28px"} 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:6px">
          <tr><td style="padding:22px 26px;border-left:2px solid ${ACCENT};border-radius:6px 0 0 6px">
            <p style="margin:0 0 14px;font-family:${BODY_FONT};font-size:16px;color:${INK};line-height:1.4">Hi ${escapeHtml(capitalize(c.firstName))},</p>
            <div style="font-family:${BODY_FONT};font-size:15px;line-height:1.7;color:${INK};white-space:pre-wrap">${escapeHtml(c.message.trim())}</div>
          </td></tr>
        </table>
      </td></tr>`
    : `<tr><td style="padding:${c.triggerLabel ? "4px" : "28px"} 32px 0">
        <p style="margin:0;font-family:${BODY_FONT};font-size:16px;color:${INK};line-height:1.5">Hi ${escapeHtml(capitalize(c.firstName))},</p>
      </td></tr>`;

  // ── Venue display ──────────────────────────────────────────────────
  const venueRow = `<tr><td style="padding:32px 32px 0">
    <h1 style="margin:0;font-family:${BODY_FONT};font-size:30px;font-weight:400;line-height:1.15;letter-spacing:-0.01em;color:${INK}">${escapeHtml(c.venueName)}</h1>
    <p style="margin:8px 0 0;font-family:${BODY_FONT};font-size:15px;color:${INK_SOFT};line-height:1.5">${escapeHtml(c.longDate)}</p>
    ${c.venueAddress ? `<p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:14px;color:${INK_SOFT};line-height:1.5">${escapeHtml(c.venueAddress)}</p>` : ""}
    ${c.mapLink ? `<p style="margin:10px 0 0"><a href="${c.mapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">Open in Maps →</a></p>` : ""}
  </td></tr>`;

  // ── Schedule table — Downbeat highlighted as the main event ────────
  const timeRow = (
    label: string,
    value: string,
    sub: string | null,
    opts: { emphasize?: boolean; first?: boolean } = {},
  ) => {
    // Emphasize = the Downbeat row. Slightly larger than other rows, bold,
    // accent color on the time, and a soft warm tint on both cells so the
    // row reads as the visual climax of the schedule without screaming
    // (the older uppercase-red treatment looked alarm-like).
    const baseTopBorder = opts.first ? "" : `border-top:1px solid ${LINE_SOFT};`;
    const cellPadding = opts.first ? "10px 0 14px" : "14px 0";
    const labelCellPadding = opts.emphasize
      ? (opts.first ? "12px 14px 14px 14px" : "14px 14px 14px 14px")
      : cellPadding;
    const valueCellPadding = labelCellPadding;
    const labelStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? INK : INK_SOFT};font-size:${opts.emphasize ? "15px" : "14px"};font-weight:${opts.emphasize ? 700 : 400};padding:${labelCellPadding};${baseTopBorder}letter-spacing:0.01em;vertical-align:top;${opts.emphasize ? `background:${PAPER_WARM};border-radius:6px 0 0 6px;` : ""}`;
    const valueStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? ACCENT : INK};font-size:${opts.emphasize ? "20px" : "15px"};font-weight:${opts.emphasize ? 600 : 400};text-align:right;padding:${valueCellPadding};${baseTopBorder}vertical-align:top;font-variant-numeric:tabular-nums;${opts.emphasize ? `background:${PAPER_WARM};border-radius:0 6px 6px 0;` : ""}`;
    return `<tr>
      <td style="${labelStyle}">${escapeHtml(label)}${sub ? `<div style="margin-top:4px;font-family:${BODY_FONT};font-size:11.5px;font-weight:400;color:${INK_MUTE};letter-spacing:0;font-style:italic;line-height:1.5">${escapeHtml(sub)}</div>` : ""}</td>
      <td style="${valueStyle}">${escapeHtml(value)}</td>
    </tr>`;
  };

  const scheduleRows: string[] = [];
  let isFirst = true;
  if (c.loadIn) {
    scheduleRows.push(timeRow("Load in", c.loadIn, null, { first: isFirst }));
    isFirst = false;
  }
  if (c.soundcheck) {
    scheduleRows.push(timeRow("Sound check", c.soundcheck, SOUNDCHECK_EXPLAINER, { first: isFirst }));
    isFirst = false;
  }
  if (c.soundcheckEnd) {
    scheduleRows.push(timeRow("Sound check complete", c.soundcheckEnd, "band is freed up after this time", { first: isFirst }));
    isFirst = false;
  }
  if (c.call) {
    scheduleRows.push(timeRow("Call", c.call, null, { first: isFirst }));
    isFirst = false;
  }
  scheduleRows.push(timeRow("Downbeat", c.downbeat, null, { emphasize: true, first: isFirst }));
  isFirst = false;
  if (c.finish) scheduleRows.push(timeRow("Finish", c.finish, null, { first: isFirst }));
  if (c.attire) scheduleRows.push(timeRow("Attire", c.attire, null, { first: isFirst }));

  const scheduleBlock = `<tr><td style="padding:24px 32px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      ${scheduleRows.join("")}
    </table>
  </td></tr>`;

  // ── Loading info & notes ───────────────────────────────────────────
  const loadingNotesBody = [
    c.loadingInfo
      ? `<p style="margin:0;font-family:${BODY_FONT};font-size:14px;color:${INK};line-height:1.6;white-space:pre-wrap">${escapeHtml(c.loadingInfo)}</p>`
      : "",
    c.notes
      ? `<p style="margin:${c.loadingInfo ? "12px" : "0"} 0 0;font-family:${BODY_FONT};font-size:14px;color:${INK_SOFT};line-height:1.6;white-space:pre-wrap">${escapeHtml(c.notes)}</p>`
      : "",
    c.loadingMapLink
      ? `<p style="margin:${c.loadingInfo || c.notes ? "14px" : "0"} 0 0"><a href="${c.loadingMapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">📍 Open load-in map →</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const loadingNotesBlock =
    c.loadingInfo || c.loadingMapLink || c.notes
      ? `<tr><td style="padding:28px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:6px">
            <tr><td style="padding:20px 24px">
              ${eyebrow("Special loading info & notes")}
              ${loadingNotesBody}
            </td></tr>
          </table>
        </td></tr>`
      : "";

  // ── Set list + materials — proper button-style CTAs ────────────────
  const gigSheetUrl = `https://gigwright.com/g/${c.gigId}`;

  // Single CTA "card" — a tappable link styled like a button row. The
  // `last` flag drops the bottom margin so the second card sits flush.
  const ctaButton = (
    icon: string,
    label: string,
    sublabel: string | null,
    href: string,
    last: boolean,
  ) => `<a href="${href}" style="display:block;text-decoration:none;background:#FFFFFF;border:1px solid ${LINE};border-radius:8px;padding:16px 18px;margin:0 0 ${last ? "0" : "10px"};color:${INK};font-family:${BODY_FONT}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:18px;width:32px;vertical-align:middle;line-height:1">${icon}</td>
            <td style="vertical-align:middle">
              <div style="font-family:${BODY_FONT};font-size:14px;font-weight:700;color:${ACCENT};line-height:1.3;letter-spacing:0.01em">${escapeHtml(label)}</div>
              ${sublabel ? `<div style="font-family:${BODY_FONT};font-size:12px;color:${INK_MUTE};line-height:1.5;margin-top:3px">${escapeHtml(sublabel)}</div>` : ""}
            </td>
            <td style="text-align:right;vertical-align:middle;font-family:${BODY_FONT};color:${ACCENT};font-size:18px;width:24px">→</td>
          </tr>
        </table>
      </a>`;

  const setlistCta = c.setlistUrl
    ? ctaButton("📄", c.setlistFileName ?? "Set list (PDF)", null, c.setlistUrl, false)
    : ctaButton("📄", "Set list", "Posts before downbeat — view on gig sheet", gigSheetUrl, false);
  const materialsCta = c.materialsUrl
    ? ctaButton("📁", "Gig materials folder", "Charts, audio, references", c.materialsUrl, true)
    : ctaButton("📁", "Gig materials", "Posts when ready — view on gig sheet", gigSheetUrl, true);

  const linksBlock = `<tr><td style="padding:28px 32px 0">
    ${eyebrow("Music & materials")}
    ${setlistCta}
    ${materialsCta}
  </td></tr>`;

  // ── Lineup ─────────────────────────────────────────────────────────
  // The "Leader" tag and the role text can collide ("Leader" tag + role
  // "Sax / Leader" reads as "Leader Leader Sax"). Strip a trailing or
  // leading "leader" from the role string when the row is also tagged
  // as the leader, so the two pieces of UI carry distinct information.
  const cleanLeaderRole = (role: string | null, isLeader: boolean) => {
    if (!role) return "";
    if (!isLeader) return role;
    const cleaned = role
      .replace(/\s*[\/|·,&]\s*leader\s*$/i, "")
      .replace(/^\s*leader\s*[\/|·,&]\s*/i, "")
      .replace(/^\s*leader\s*$/i, "")
      .trim();
    return cleaned;
  };

  // Phone numbers are rendered as tappable tel: links so band members
  // can contact each other directly from the email — common case is
  // "I'm running late, calling the bass player." We strip non-digit
  // characters for the tel: href but keep the original string visible
  // so the format the bandleader entered is preserved.
  const phoneLine = (phone: string | null) => {
    if (!phone) return "";
    const tel = phone.replace(/[^0-9+]/g, "");
    return `<div style="margin-top:3px;font-family:${BODY_FONT};font-size:12.5px;color:${INK_SOFT};line-height:1.4">
        <a href="tel:${escapeHtml(tel)}" style="color:${ACCENT};text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.2)">${escapeHtml(phone)}</a>
      </div>`;
  };

  const lineupRows = c.lineup
    .map((m, i) => {
      const role = cleanLeaderRole(m.role, m.isLeader);
      return `<tr>
        <td style="padding:${i === 0 ? "2px" : "14px"} 0 14px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:14.5px;color:${INK};line-height:1.4;vertical-align:top">
          ${escapeHtml(m.name)}${m.isLeader ? ` <span style="color:${ACCENT};font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;margin-left:8px">Leader</span>` : ""}
          ${phoneLine(m.phone)}
        </td>
        <td style="padding:${i === 0 ? "2px" : "14px"} 0 14px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:13px;color:${INK_MUTE};text-align:right;line-height:1.4;font-style:italic;vertical-align:top">
          ${role ? escapeHtml(role) : ""}
        </td>
      </tr>`;
    })
    .join("");

  const lineupBlock =
    c.lineup.length > 0
      ? `<tr><td style="padding:28px 32px 0">
          ${eyebrow("Lineup")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            ${lineupRows}
          </table>
        </td></tr>`
      : "";

  // ── Footer ─────────────────────────────────────────────────────────
  const footerBlock = `<tr><td style="padding:32px 32px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};border-collapse:collapse">
      <tr><td style="padding:18px 0 0">
        <p style="margin:0"><a href="${gigSheetUrl}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid rgba(126,36,24,0.25);padding-bottom:1px">View the full gig sheet →</a></p>
        <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:12px;color:${INK_MUTE};line-height:1.6">
          Sent on behalf of <span style="color:${INK_SOFT};font-weight:600">${escapeHtml(titleCaseName(c.bandleader))}</span> via
          <a href="https://gigwright.com" style="color:${INK_MUTE};text-decoration:none;border-bottom:1px solid ${LINE}">GigWright</a> —
          the bandleader's workbench from the first call to the final payout.
        </p>
      </td></tr>
    </table>
  </td></tr>`;

  // ── Header (wordmark) ──────────────────────────────────────────────
  // A thin hairline below the wordmark visually separates the masthead
  // from the body content. The "GIG SHEET" eyebrow on the right echoes
  // the same eyebrow style used throughout the email so the page has a
  // consistent typographic vocabulary.
  const headerBlock = `<tr><td style="padding:36px 32px 20px;border-bottom:1px solid ${LINE_SOFT}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${BODY_FONT};font-size:22px;font-weight:500;letter-spacing:-0.01em;color:${INK};line-height:1">
          Gig<span style="color:${ACCENT};font-weight:300;font-style:italic">Wright</span>
        </td>
        <td style="text-align:right;font-family:${BODY_FONT};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${INK_MUTE};line-height:1">
          Gig sheet
        </td>
      </tr>
    </table>
  </td></tr>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(c.venueName)} · ${escapeHtml(c.longDate)}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${BODY_FONT};-webkit-font-smoothing:antialiased">
    <!-- Preheader (shows in inbox preview, hidden in body) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(c.venueName)} · ${escapeHtml(c.longDate)} · downbeat ${escapeHtml(c.downbeat)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(14,12,9,0.08);border-radius:12px;box-shadow:0 1px 2px rgba(14,12,9,0.04)">
          ${headerBlock}
          ${triggerHeading}
          ${greetingRow}
          ${venueRow}
          ${scheduleBlock}
          ${loadingNotesBlock}
          ${linksBlock}
          ${lineupBlock}
          ${footerBlock}
        </table>
        <p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:11px;color:${INK_MUTE};text-align:center">
          You're receiving this because ${escapeHtml(titleCaseName(c.bandleader))} added you to a gig.
        </p>
      </td></tr>
    </table>
    <!--RECIPIENTS-->
  </body>
</html>`;
}
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

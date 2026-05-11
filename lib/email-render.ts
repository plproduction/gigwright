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
  secondDownbeat: string | null;
  secondFinish: string | null;
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
  // Conditional labelling: when there's a second show, the first one
  // gets relabelled "1st downbeat / 1st finish" so the email reads
  // unambiguously to a musician glancing at it on a phone screen.
  const dbLabel = c.secondDownbeat ? "1st downbeat" : "Downbeat";
  const fnLabel = c.secondDownbeat ? "1st finish" : "Finish";
  lines.push(`${dbLabel.padEnd(12)} ${c.downbeat}`);
  if (c.finish) lines.push(`${fnLabel.padEnd(12)} ${c.finish}`);
  if (c.secondDownbeat) {
    lines.push(`2nd downbeat ${c.secondDownbeat}`);
    if (c.secondFinish) lines.push(`2nd finish   ${c.secondFinish}`);
  }
  if (c.attire) {
    lines.push("");
    lines.push(`Attire: ${c.attire}`);
  }

  // Loading info (logistics: how to get into the venue). Notes is now
  // separate — see below.
  if (c.loadingInfo || c.loadingMapLink) {
    lines.push("");
    lines.push(`Special loading info:`);
    if (c.loadingInfo) lines.push(`  ${c.loadingInfo.replace(/\n/g, "\n  ")}`);
    if (c.loadingMapLink) {
      if (c.loadingInfo) lines.push("");
      lines.push(`  Load-in map: ${c.loadingMapLink}`);
    }
  }

  // Notes from the bandleader — freeform "anything worth remembering."
  if (c.notes) {
    lines.push("");
    lines.push(`Notes from the bandleader:`);
    lines.push(`  ${c.notes.replace(/\n/g, "\n  ")}`);
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

  // Palette tuned for editorial / hospitality refinement:
  // - PAPER and PAPER_WARM warmed up toward champagne/ivory rather than
  //   pinkish cream, so the email reads as paper-and-ink rather than
  //   web-app
  // - ACCENT deepened to an aged Burgundy (less candy, more wine cellar)
  // - INK warmed slightly so the body type doesn't feel like a screen
  // - GOLD added for ornaments / fine rules, used very sparingly
  const ACCENT = "#6B1F15";
  const ACCENT_SOFT = "rgba(107,31,21,0.12)";
  const INK = "#1A1410";
  const INK_SOFT = "#4A453C";
  const INK_MUTE = "#8A8576";
  const LINE = "#E2DDD0";
  const LINE_SOFT = "#EDE8DA";
  const GOLD = "#A88B4A"; // hairline ornaments only
  const PAPER = "#F5F0E5";
  const PAPER_WARM = "#FBF6E8";
  const BODY_FONT = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif";

  // Editorial-style "eyebrow" label — small caps in accent color, with a
  // hairline rule extending to the right edge so each section has a quiet
  // letterpress wayfinder. Two flavors: stand-alone (used inside cards
  // where the hairline would look busy) and full-width with rule.
  const eyebrow = (text: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border-collapse:collapse">
      <tr>
        <td style="font-family:${BODY_FONT};font-size:10.5px;font-weight:700;letter-spacing:0.28em;color:${ACCENT};text-transform:uppercase;line-height:1.4;padding-right:14px;white-space:nowrap">${escapeHtml(text)}</td>
        <td style="border-bottom:1px solid ${LINE};height:1px;width:100%"></td>
      </tr>
    </table>`;
  const eyebrowPlain = (text: string) =>
    `<p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:10.5px;font-weight:700;letter-spacing:0.28em;color:${ACCENT};text-transform:uppercase;line-height:1.4">${escapeHtml(text)}</p>`;

  // ── Eyebrow / greeting block ───────────────────────────────────────
  const triggerHeading = c.triggerLabel
    ? `<tr><td style="padding:36px 40px 0">${eyebrow(c.triggerLabel)}</td></tr>`
    : "";

  // Greeting: when the bandleader wrote a custom note we wrap the whole
  // greeting in a soft champagne panel so it reads like a personal letter.
  // The 2px accent rule on the left echoes the eyebrow color above the
  // panel without screaming. When there's no message, the cream panel
  // would just contain "Hi <name>," which looks lonely — so in that case
  // we render a plain salutation paragraph instead.
  const greetingRow = c.message
    ? `<tr><td style="padding:${c.triggerLabel ? "4px" : "36px"} 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:8px">
          <tr><td style="padding:26px 28px;border-left:2px solid ${ACCENT};border-radius:8px 0 0 8px">
            <p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:16px;color:${INK};line-height:1.4;letter-spacing:0.005em">Hi ${escapeHtml(capitalize(c.firstName))},</p>
            <div style="font-family:${BODY_FONT};font-size:15px;line-height:1.75;color:${INK};letter-spacing:0.005em;white-space:pre-wrap">${escapeHtml(c.message.trim())}</div>
          </td></tr>
        </table>
      </td></tr>`
    : `<tr><td style="padding:${c.triggerLabel ? "4px" : "36px"} 40px 0">
        <p style="margin:0;font-family:${BODY_FONT};font-size:16px;color:${INK};line-height:1.55;letter-spacing:0.005em">Hi ${escapeHtml(capitalize(c.firstName))},</p>
      </td></tr>`;

  // ── Venue display ──────────────────────────────────────────────────
  // Marquee treatment: large Georgia heading at 36px with tighter
  // letter-spacing for that hand-set quality. A 36-wide gold hairline
  // ornament sits between the venue name and the date — acts as a
  // typographic "rule above" the byline rather than a heavy break.
  const venueRow = `<tr><td style="padding:40px 40px 0">
    <h1 style="margin:0;font-family:${BODY_FONT};font-size:36px;font-weight:400;line-height:1.08;letter-spacing:-0.018em;color:${INK}">${escapeHtml(c.venueName)}</h1>
    <div style="margin:16px 0 12px;width:36px;height:1px;background:${GOLD};line-height:1px;font-size:1px">&nbsp;</div>
    <p style="margin:0;font-family:${BODY_FONT};font-size:15px;color:${INK_SOFT};line-height:1.55;letter-spacing:0.01em">${escapeHtml(c.longDate)}</p>
    ${c.venueAddress ? `<p style="margin:3px 0 0;font-family:${BODY_FONT};font-size:13.5px;color:${INK_SOFT};line-height:1.55;letter-spacing:0.01em">${escapeHtml(c.venueAddress)}</p>` : ""}
    ${c.mapLink ? `<p style="margin:16px 0 0"><a href="${c.mapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:11.5px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid ${ACCENT_SOFT};padding-bottom:3px">Open in Maps</a></p>` : ""}
  </td></tr>`;

  // ── Schedule table — Downbeat highlighted as the main event ────────
  const timeRow = (
    label: string,
    value: string,
    sub: string | null,
    opts: { emphasize?: boolean; first?: boolean } = {},
  ) => {
    // Emphasize = a Downbeat row (the visual climax of its show). Soft
    // warm tint behind both cells for emphasis; the label stays small
    // caps with extra tracking, the time renders larger but in REGULAR
    // weight Georgia (not bold) for that lighter, hand-set feel that
    // reads as elegant rather than alarming.
    const baseTopBorder = opts.first ? "" : `border-top:1px solid ${LINE_SOFT};`;
    const cellPadding = opts.first ? "12px 0 16px" : "16px 0";
    const labelCellPadding = opts.emphasize
      ? (opts.first ? "14px 16px 16px" : "16px")
      : cellPadding;
    const valueCellPadding = labelCellPadding;
    const labelStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? INK : INK_SOFT};font-size:${opts.emphasize ? "11px" : "13.5px"};font-weight:${opts.emphasize ? 700 : 400};padding:${labelCellPadding};${baseTopBorder}letter-spacing:${opts.emphasize ? "0.22em" : "0.01em"};text-transform:${opts.emphasize ? "uppercase" : "none"};vertical-align:middle;${opts.emphasize ? `background:${PAPER_WARM};border-radius:6px 0 0 6px;` : ""}`;
    const valueStyle = `font-family:${BODY_FONT};color:${opts.emphasize ? ACCENT : INK};font-size:${opts.emphasize ? "26px" : "15px"};font-weight:${opts.emphasize ? 400 : 400};text-align:right;padding:${valueCellPadding};${baseTopBorder}vertical-align:middle;font-variant-numeric:tabular-nums;letter-spacing:${opts.emphasize ? "-0.01em" : "0"};${opts.emphasize ? `background:${PAPER_WARM};border-radius:0 6px 6px 0;` : ""}`;
    return `<tr>
      <td style="${labelStyle}">${escapeHtml(label)}${sub ? `<div style="margin-top:5px;font-family:${BODY_FONT};font-size:11.5px;font-weight:400;color:${INK_MUTE};letter-spacing:0;text-transform:none;font-style:italic;line-height:1.5">${escapeHtml(sub)}</div>` : ""}</td>
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
  // First-show downbeat. When a second show exists, relabel both rows
  // ("1st downbeat", "1st finish") so the schedule reads cleanly. Both
  // downbeats are emphasized — they're each the visual climax of their
  // respective show.
  const dbLabel = c.secondDownbeat ? "1st downbeat" : "Downbeat";
  const fnLabel = c.secondDownbeat ? "1st finish" : "Finish";
  scheduleRows.push(
    timeRow(dbLabel, c.downbeat, null, { emphasize: true, first: isFirst }),
  );
  isFirst = false;
  if (c.finish)
    scheduleRows.push(timeRow(fnLabel, c.finish, null, { first: isFirst }));
  if (c.secondDownbeat) {
    scheduleRows.push(
      timeRow("2nd downbeat", c.secondDownbeat, null, { emphasize: true, first: isFirst }),
    );
    if (c.secondFinish)
      scheduleRows.push(timeRow("2nd finish", c.secondFinish, null, { first: isFirst }));
  }
  if (c.attire) scheduleRows.push(timeRow("Attire", c.attire, null, { first: isFirst }));

  const scheduleBlock = `<tr><td style="padding:32px 40px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      ${scheduleRows.join("")}
    </table>
  </td></tr>`;

  // ── Loading info (NOT notes — those get their own section below) ───
  // Loading info + map link travel together because they're both about
  // "how do I physically get into this venue." Notes is a different
  // category — it's the freeform "anything worth remembering" field, so
  // it deserves its own clearly-labelled section.
  const loadingInfoBody = [
    c.loadingInfo
      ? `<p style="margin:0;font-family:${BODY_FONT};font-size:14px;color:${INK};line-height:1.65;letter-spacing:0.005em;white-space:pre-wrap">${escapeHtml(c.loadingInfo)}</p>`
      : "",
    c.loadingMapLink
      ? `<p style="margin:${c.loadingInfo ? "14px" : "0"} 0 0"><a href="${c.loadingMapLink}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:11.5px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid ${ACCENT_SOFT};padding-bottom:3px">Open load-in map</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const loadingInfoBlock =
    c.loadingInfo || c.loadingMapLink
      ? `<tr><td style="padding:36px 40px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:8px">
            <tr><td style="padding:24px 26px">
              ${eyebrowPlain("Special loading info")}
              ${loadingInfoBody}
            </td></tr>
          </table>
        </td></tr>`
      : "";

  // Dedicated Notes section. Bandleader's freeform context — parking,
  // green room, dress code clarifications, audience vibe, anything they
  // want the band to know that doesn't fit anywhere else. Rendered as
  // its own quiet panel so it doesn't get confused with loading info.
  const notesBlock = c.notes
    ? `<tr><td style="padding:24px 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER_WARM};border-radius:8px">
          <tr><td style="padding:24px 26px">
            ${eyebrowPlain("Notes from the bandleader")}
            <p style="margin:0;font-family:${BODY_FONT};font-size:14px;color:${INK};line-height:1.7;letter-spacing:0.005em;white-space:pre-wrap">${escapeHtml(c.notes)}</p>
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

  const linksBlock = `<tr><td style="padding:36px 40px 0">
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

  // Phone numbers as tappable tel: links so band members can contact
  // each other directly from the email — "I'm running late, calling the
  // bass player." We strip non-digit characters for the tel: href but
  // keep the original format visible.
  const phoneLine = (phone: string | null) => {
    if (!phone) return "";
    const tel = phone.replace(/[^0-9+]/g, "");
    return `<div style="margin-top:5px;font-family:${BODY_FONT};font-size:12.5px;color:${INK_SOFT};line-height:1.4;letter-spacing:0.01em">
        <a href="tel:${escapeHtml(tel)}" style="color:${ACCENT};text-decoration:none;border-bottom:1px solid ${ACCENT_SOFT}">${escapeHtml(phone)}</a>
      </div>`;
  };

  const lineupRows = c.lineup
    .map((m, i) => {
      const role = cleanLeaderRole(m.role, m.isLeader);
      return `<tr>
        <td style="padding:${i === 0 ? "4px" : "16px"} 0 16px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:15px;color:${INK};line-height:1.4;vertical-align:top;letter-spacing:0.005em">
          <em style="font-style:italic">${escapeHtml(m.name)}</em>${m.isLeader ? ` <span style="color:${ACCENT};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;margin-left:10px;font-style:normal">Leader</span>` : ""}
          ${phoneLine(m.phone)}
        </td>
        <td style="padding:${i === 0 ? "4px" : "16px"} 0 16px;${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}font-family:${BODY_FONT};font-size:13px;color:${INK_MUTE};text-align:right;line-height:1.4;vertical-align:top;letter-spacing:0.06em;text-transform:uppercase">
          ${role ? escapeHtml(role) : ""}
        </td>
      </tr>`;
    })
    .join("");

  const lineupBlock =
    c.lineup.length > 0
      ? `<tr><td style="padding:36px 40px 0">
          ${eyebrow("Lineup")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
            ${lineupRows}
          </table>
        </td></tr>`
      : "";

  // ── Footer ─────────────────────────────────────────────────────────
  // Centered with a gold hairline ornament for the editorial flourish.
  // The "View full gig sheet" CTA is a small caps button-pill rather
  // than a plain link — feels more deliberate, like the back of a
  // letterpress invitation card.
  const footerBlock = `<tr><td style="padding:44px 40px 36px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="border-top:1px solid ${LINE_SOFT};padding:28px 0 0">
        <div style="margin:0 auto 18px;width:36px;height:1px;background:${GOLD};line-height:1px;font-size:1px">&nbsp;</div>
        <p style="margin:0 0 18px"><a href="${gigSheetUrl}" style="font-family:${BODY_FONT};color:${ACCENT};font-size:11.5px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;text-decoration:none">View the Full Gig Sheet</a></p>
        <p style="margin:0;font-family:${BODY_FONT};font-size:12.5px;color:${INK_MUTE};line-height:1.7;letter-spacing:0.01em;font-style:italic">
          Sent on behalf of <span style="color:${INK_SOFT};font-weight:400;font-style:normal">${escapeHtml(titleCaseName(c.bandleader))}</span> via <a href="https://gigwright.com" style="color:${INK_MUTE};text-decoration:none;border-bottom:1px solid ${LINE};font-style:normal">GigWright</a><br/>
          The bandleader's workbench, from the first call to the final payout.
        </p>
      </td></tr>
    </table>
  </td></tr>`;

  // ── Header (masthead) ──────────────────────────────────────────────
  // Hairline below the wordmark separates the masthead from the body.
  // "GIG SHEET" eyebrow on the right uses the same letterpress treatment
  // as the section eyebrows below — single typographic vocabulary.
  const headerBlock = `<tr><td style="padding:42px 40px 24px;border-bottom:1px solid ${LINE_SOFT}">
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
      <tr><td align="center" style="padding:40px 16px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(26,20,16,0.07);border-radius:14px;box-shadow:0 24px 48px -24px rgba(26,20,16,0.12),0 4px 8px -2px rgba(26,20,16,0.04)">
          ${headerBlock}
          ${triggerHeading}
          ${greetingRow}
          ${venueRow}
          ${scheduleBlock}
          ${loadingInfoBlock}
          ${notesBlock}
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

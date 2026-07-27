// Fuzzy matching for extracted-contract Venue and Producer values against
// the bandleader's existing rows. Called from the /gigs/new/from-contract
// review page to decide "reuse this existing venue" vs. "create a new
// one" without ever showing Patrick a duplicate.
//
// Everything here is pure: given the extraction + the tenant's rows,
// return a match plan. The route handler applies it.

import { db } from "@/lib/db";
import type { ExtractedContract } from "@/lib/extract-contract";

// ————————————————————————————————————————————————————————————————
// Venue matching
// ————————————————————————————————————————————————————————————————

export type VenueMatch =
  | { kind: "exact"; venueId: string; venueName: string }
  | { kind: "address"; venueId: string; venueName: string }
  | {
      kind: "fuzzy";
      venueId: string;
      venueName: string;
      suggestion: string;
    }
  | { kind: "new"; suggestion: ExtractedContract["venue"] };

// Normalize a venue name so "The Sunset Casino Ballroom" collapses to
// "sunset casino". Order matters: strip decorative suffixes BEFORE
// stripping "the" so "The Ballroom" doesn't become "" (never call it
// with the whole thing empty).
function normalizeVenueName(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Strip decorative venue-type suffixes.
  s = s.replace(
    /\s+(ballroom|hotel|casino|resort|room|club|theater|theatre|hall|lounge|restaurant|bar|grill)$/,
    "",
  );
  // Strip leading article.
  s = s.replace(/^the\s+/, "");
  // Collapse punctuation and whitespace.
  s = s.replace(/[.,'"&]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

function normalizeStreet(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\s+(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|parkway|pkwy|highway|hwy|route|rte)\.?\b/g, "")
    .replace(/[.,'"#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance — small enough that ~20 venues × one extraction
// is trivial. Used as a last-resort fuzzy check.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev: number[] = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(
        curr + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

export async function matchVenue(
  ownerId: string,
  extracted: ExtractedContract["venue"],
): Promise<VenueMatch> {
  const venues = await db.venue.findMany({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      addressL1: true,
      city: true,
    },
  });

  const targetName = normalizeVenueName(extracted.name);
  const targetStreet = normalizeStreet(extracted.street);

  // Pass 1: exact name match (post-normalization).
  for (const v of venues) {
    if (normalizeVenueName(v.name) === targetName) {
      return { kind: "exact", venueId: v.id, venueName: v.name };
    }
  }

  // Pass 2: street address match — same building, name may vary
  // ("Marriott Hotel" vs. "JW Marriott" at the same address).
  if (targetStreet) {
    for (const v of venues) {
      if (v.addressL1 && normalizeStreet(v.addressL1) === targetStreet) {
        return { kind: "address", venueId: v.id, venueName: v.name };
      }
    }
  }

  // Pass 3: fuzzy name match — Levenshtein ≤ 2 on the normalized name.
  // Higher-than-2 gets too many false positives ("Sunset" vs. "Sunrise").
  let best: {
    v: (typeof venues)[number];
    distance: number;
  } | null = null;
  for (const v of venues) {
    const d = levenshtein(normalizeVenueName(v.name), targetName);
    if (d <= 2 && (!best || d < best.distance)) best = { v, distance: d };
  }
  if (best) {
    return {
      kind: "fuzzy",
      venueId: best.v.id,
      venueName: best.v.name,
      suggestion: extracted.name,
    };
  }

  return { kind: "new", suggestion: extracted };
}

// ————————————————————————————————————————————————————————————————
// Producer matching
// ————————————————————————————————————————————————————————————————

export type ProducerMatch =
  | {
      kind: "email";
      producerId: string;
      producerName: string;
      producerEmail: string;
    }
  | {
      kind: "name-phone";
      producerId: string;
      producerName: string;
    }
  | {
      kind: "name-only";
      producerId: string;
      producerName: string;
      suggestion: string;
    }
  | { kind: "new"; suggestion: ExtractedContract["producer"] }
  | { kind: "none" }; // extraction had no producer info at all

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^\d]/g, ""); // digits only
}

function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[.,'"]/g, "").replace(/\s+/g, " ").trim();
}

export async function matchProducer(
  ownerId: string,
  extracted: ExtractedContract["producer"],
): Promise<ProducerMatch> {
  // No producer info at all — skip the match. Common when contracts are
  // structured as a venue letterhead only, no signatory block.
  if (!extracted.name && !extracted.email && !extracted.phone) {
    return { kind: "none" };
  }
  if (!extracted.name) {
    // We got email or phone but no name — very unusual. Treat as new
    // rather than trying to match without a name anchor.
    return { kind: "new", suggestion: extracted };
  }

  const producers = await db.producer.findMany({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  });

  const targetName = normalizeName(extracted.name);
  const targetEmail = extracted.email?.toLowerCase().trim() ?? "";
  const targetPhone = normalizePhone(extracted.phone);

  // Pass 1: email match (case-insensitive). Most reliable single signal.
  if (targetEmail) {
    for (const p of producers) {
      if (p.email && p.email.toLowerCase().trim() === targetEmail) {
        return {
          kind: "email",
          producerId: p.id,
          producerName: p.name,
          producerEmail: p.email,
        };
      }
    }
  }

  // Pass 2: name + phone digits match.
  if (targetPhone) {
    for (const p of producers) {
      if (
        normalizeName(p.name) === targetName &&
        normalizePhone(p.phone) === targetPhone
      ) {
        return {
          kind: "name-phone",
          producerId: p.id,
          producerName: p.name,
        };
      }
    }
  }

  // Pass 3: name-only match — offer as a suggestion, don't auto-merge.
  // Two different people named "John Smith" happens.
  for (const p of producers) {
    if (normalizeName(p.name) === targetName) {
      return {
        kind: "name-only",
        producerId: p.id,
        producerName: p.name,
        suggestion: extracted.name,
      };
    }
  }

  return { kind: "new", suggestion: extracted };
}

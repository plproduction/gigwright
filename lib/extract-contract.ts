// Contract extraction — takes a Vercel Blob URL pointing at a PDF (or
// image) of a signed music-performance contract and returns structured
// booking data ready to populate a Gig + Venue + Producer.
//
// Uses Claude Sonnet 5 via the Anthropic API. Sonnet 5 reads PDFs
// natively (no OCR step) and reliably extracts named fields when told
// exactly what to look for.
//
// Cost per extraction is roughly 2 cents — a typical 2-page contract is
// under 5K input tokens plus a few hundred output tokens. See
// docs/specs/contract-extraction.md for the full spec.

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_MODEL = "claude-sonnet-5";

// ————————————————————————————————————————————————————————————————
// Public shape — what the extractor returns.
// ————————————————————————————————————————————————————————————————

export type ExtractedContract = {
  confidence: "high" | "medium" | "low";
  venue: {
    name: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  event: {
    // ISO 8601 calendar date, no timezone: "2026-08-15"
    date: string | null;
    // 24-hour local wall-clock time: "18:30"
    loadInTime: string | null;
    downbeatTime: string | null;
    endTime: string | null;
  };
  producer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
  };
  unrecognizedFields: string[];
};

export type ExtractionResult =
  | { ok: true; data: ExtractedContract }
  | { ok: false; error: string };

// ————————————————————————————————————————————————————————————————
// Prompt
// ————————————————————————————————————————————————————————————————

const SYSTEM_PROMPT = `You are extracting structured booking information from a music performance contract for a bandleader's booking-management app. The user will attach a PDF (or photo) of a contract. Read it and return the exact fields defined in the tool schema.

Rules:
- Times are 24-hour HH:MM in the venue's local wall-clock time (do NOT convert to UTC).
- Dates are ISO 8601 (YYYY-MM-DD), no timezone.
- If a field is not stated in the contract, return null. Do NOT guess.
- Load-in time is often not stated. If the contract only lists performance times, return null for loadInTime — the app will fall back to a default.
- The venue name is the PERFORMANCE location, not the client's business or the booking agent. Example: "Smith Corp Holiday Party at The Sunset Casino" → venue.name = "The Sunset Casino".
- Producer = the client-side person who signed / booked the show (the "purchaser"), NOT the venue's on-site contact. Extract their personal name, email, phone, and company if present.
- Return your confidence: "high" when every field (venue name/address, date, downbeat, end time, producer name/email) is unambiguous; "medium" when one or two of those are missing or unclear; "low" when the document doesn't look like a music-performance contract at all.
- List anything you saw in the contract that doesn't fit the schema (cancellation policy, sound check requirements, rider items, dress code, etc.) as strings in unrecognizedFields — Patrick may want to paste them into gig notes.`;

// The tool schema Claude uses. Enforcing structured output via a tool
// call is more reliable than "please output JSON" in the prompt.
const EXTRACTION_TOOL = {
  name: "return_extracted_contract",
  description:
    "Return the booking fields extracted from the attached music performance contract.",
  input_schema: {
    type: "object" as const,
    required: ["confidence", "venue", "event", "producer", "unrecognizedFields"],
    properties: {
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      venue: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          street: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          zip: { type: ["string", "null"] },
        },
      },
      event: {
        type: "object",
        properties: {
          date: { type: ["string", "null"] },
          loadInTime: { type: ["string", "null"] },
          downbeatTime: { type: ["string", "null"] },
          endTime: { type: ["string", "null"] },
        },
      },
      producer: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          company: { type: ["string", "null"] },
        },
      },
      unrecognizedFields: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
};

// ————————————————————————————————————————————————————————————————
// Runtime validation — light, hand-written (no zod dependency).
// ————————————————————————————————————————————————————————————————

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function coerce(raw: unknown): ExtractedContract | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const confidenceRaw = r.confidence;
  const confidence =
    confidenceRaw === "high" ||
    confidenceRaw === "medium" ||
    confidenceRaw === "low"
      ? confidenceRaw
      : "medium";

  const venueRaw = (r.venue ?? {}) as Record<string, unknown>;
  const venueName = asStringOrNull(venueRaw.name);
  if (!venueName) return null; // venue.name is the only field we hard-require

  const eventRaw = (r.event ?? {}) as Record<string, unknown>;
  const producerRaw = (r.producer ?? {}) as Record<string, unknown>;
  const unrecognizedRaw = Array.isArray(r.unrecognizedFields)
    ? r.unrecognizedFields
    : [];

  return {
    confidence,
    venue: {
      name: venueName,
      street: asStringOrNull(venueRaw.street),
      city: asStringOrNull(venueRaw.city),
      state: asStringOrNull(venueRaw.state),
      zip: asStringOrNull(venueRaw.zip),
    },
    event: {
      date: asStringOrNull(eventRaw.date),
      loadInTime: asStringOrNull(eventRaw.loadInTime),
      downbeatTime: asStringOrNull(eventRaw.downbeatTime),
      endTime: asStringOrNull(eventRaw.endTime),
    },
    producer: {
      name: asStringOrNull(producerRaw.name),
      email: asStringOrNull(producerRaw.email),
      phone: asStringOrNull(producerRaw.phone),
      company: asStringOrNull(producerRaw.company),
    },
    unrecognizedFields: unrecognizedRaw.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    ),
  };
}

// ————————————————————————————————————————————————————————————————
// Public entry point
// ————————————————————————————————————————————————————————————————

// Extract booking fields from a contract at `blobUrl`. Accepts PDF or
// image (JPG/PNG/HEIC) — Sonnet 5 handles all of them. The URL must be
// publicly readable (Vercel Blob URLs are — the whole point of the
// direct-upload flow).
export async function extractContractFromUrl(
  blobUrl: string,
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY not configured. Add it in Netlify env vars.",
    };
  }

  const client = new Anthropic({ apiKey });

  // Sniff the file extension to decide document vs. image content block.
  // Vercel Blob URLs preserve the original extension in the pathname.
  const lower = blobUrl.toLowerCase().split("?")[0];
  const isPdf = lower.endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|heic|heif|webp|gif)$/i.test(lower);
  if (!isPdf && !isImage) {
    return {
      ok: false,
      error: `Unsupported file type at ${blobUrl}. Expected PDF or image.`,
    };
  }

  // Build the user message: either a document block (PDFs) or an image
  // block (photos of contracts). Both are followed by a short "extract
  // this" instruction — Claude does better with a clear conversational
  // kick than just a bare attachment.
  const contentBlock = isPdf
    ? ({
        type: "document" as const,
        source: { type: "url" as const, url: blobUrl },
      })
    : ({
        type: "image" as const,
        source: { type: "url" as const, url: blobUrl },
      });

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: "Extract the booking fields from this contract using the return_extracted_contract tool.",
            },
          ],
        },
      ],
    });

    // Find the tool_use content block — should be exactly one because
    // we set tool_choice to force it.
    const toolUse = response.content.find(
      (c) => c.type === "tool_use" && c.name === EXTRACTION_TOOL.name,
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      return {
        ok: false,
        error:
          "Claude did not return an extraction. Try again or fill fields manually.",
      };
    }

    const data = coerce(toolUse.input);
    if (!data) {
      return {
        ok: false,
        error:
          "Extracted data was missing the venue name — this doesn't look like a bookable contract.",
      };
    }
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      error: `Claude API error: ${msg}`,
    };
  }
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  extractContractAction,
  createGigFromContractAction,
  type CreateFromContractInput,
} from "@/lib/actions/contract-extract";
import type { ExtractedContract } from "@/lib/extract-contract";
import type {
  VenueMatch,
  ProducerMatch,
} from "@/lib/venue-producer-match";

// Three-stage flow: upload → extract → review-and-save. State is a
// plain string discriminator on `stage` — no external state library,
// no useReducer, just enough React for a linear form.

type Stage =
  | { name: "upload" }
  | { name: "uploading"; progress: number }
  | { name: "extracting"; blobUrl: string; fileName: string }
  | {
      name: "review";
      blobUrl: string;
      fileName: string;
      extracted: ExtractedContract;
      venueMatch: VenueMatch;
      producerMatch: ProducerMatch;
    }
  | { name: "error"; message: string; blobUrl?: string; fileName?: string }
  | { name: "saving" };

export function ContractExtractionFlow() {
  const [stage, setStage] = useState<Stage>({ name: "upload" });

  async function handleFile(file: File) {
    const kind = file.type;
    const acceptable = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif",
    ];
    if (!acceptable.includes(kind)) {
      setStage({
        name: "error",
        message: "Contract must be a PDF or image (JPG, PNG, HEIC).",
      });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStage({
        name: "error",
        message: "Contract must be under 25 MB.",
      });
      return;
    }

    setStage({ name: "uploading", progress: 0 });
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const pathname = `contract-extract/${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/contract-extract",
        onUploadProgress: (e) =>
          setStage({ name: "uploading", progress: Math.round(e.percentage) }),
      });
      setStage({ name: "extracting", blobUrl: blob.url, fileName: file.name });

      // Run the extraction. This is the slow step (~10 seconds for a
      // typical PDF) — the "extracting" stage has its own reassuring UI.
      const result = await extractContractAction(blob.url);
      if (!result.ok) {
        setStage({
          name: "error",
          message: result.error,
          blobUrl: blob.url,
          fileName: file.name,
        });
        return;
      }
      setStage({
        name: "review",
        blobUrl: blob.url,
        fileName: file.name,
        extracted: result.extracted,
        venueMatch: result.venueMatch,
        producerMatch: result.producerMatch,
      });
    } catch (err) {
      setStage({
        name: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }

  if (stage.name === "upload") return <UploadDropZone onFile={handleFile} />;
  if (stage.name === "uploading") return <Progress label="Uploading" value={stage.progress} />;
  if (stage.name === "extracting") return <ExtractingSpinner blobUrl={stage.blobUrl} />;
  if (stage.name === "error") return <ErrorPanel stage={stage} onRetry={() => setStage({ name: "upload" })} />;
  if (stage.name === "saving") return <Progress label="Saving gig" value={100} indeterminate />;

  return (
    <ReviewForm
      stage={stage}
      onCancel={() => setStage({ name: "upload" })}
      onSave={async (input) => {
        setStage({ name: "saving" });
        const res = await createGigFromContractAction(input);
        if (!res.ok) {
          setStage({
            name: "error",
            message: res.error,
            blobUrl: stage.blobUrl,
            fileName: stage.fileName,
          });
          return;
        }
        // Full navigation so the new gig's page fetches fresh data.
        window.location.href = `/gigs/${res.gigId}`;
      }}
    />
  );
}

// ————————————————————————————————————————————————————————————————
// Upload drop zone
// ————————————————————————————————————————————————————————————————

function UploadDropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        role="button"
        tabIndex={0}
        className={`cursor-pointer rounded-lg border border-dashed px-8 py-16 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-paper-warm/30 hover:border-accent/50 hover:bg-paper-warm/60"
        }`}
      >
        <div className="mx-auto max-w-md">
          <div className="font-serif text-[22px] font-light text-ink">
            Drop the signed contract here
          </div>
          <div className="mt-2 text-[13px] text-ink-mute">
            or click to pick a file &middot; PDF or image &middot; 25 MB max
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Progress bar / spinner shared components
// ————————————————————————————————————————————————————————————————

function Progress({
  label,
  value,
  indeterminate,
}: {
  label: string;
  value: number;
  indeterminate?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper px-8 py-14 text-center">
      <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">
        {label}{indeterminate ? "…" : ` ${value}%`}
      </div>
      <div className="mx-auto mt-4 h-1 w-full max-w-sm overflow-hidden rounded-full bg-line">
        <div
          className={`h-full bg-accent transition-all ${indeterminate ? "animate-pulse" : ""}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ExtractingSpinner({ blobUrl }: { blobUrl: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-8 py-14 text-center">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-accent">
        Reading contract
      </div>
      <div className="mt-2 font-serif text-[20px] font-light text-ink">
        Extracting venue, date, times, and client contact…
      </div>
      <div className="mt-1 text-[12px] text-ink-mute">
        Usually about 10 seconds.
      </div>
      <div className="mx-auto mt-6 h-1 w-full max-w-sm overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/3 animate-pulse bg-accent" />
      </div>
      <a
        href={blobUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-block text-[11px] uppercase tracking-[0.16em] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
      >
        Preview the file
      </a>
    </div>
  );
}

function ErrorPanel({
  stage,
  onRetry,
}: {
  stage: { name: "error"; message: string; blobUrl?: string; fileName?: string };
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent/40 bg-paper px-8 py-10">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-accent">
        Couldn&apos;t read this one
      </div>
      <div className="mt-2 text-[14px] leading-[1.55] text-ink">
        {stage.message}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Try a different file
        </button>
        {stage.blobUrl && (
          <a
            href={stage.blobUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[13px] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
          >
            Open the uploaded file
          </a>
        )}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Review form — where Patrick edits the extracted fields
// ————————————————————————————————————————————————————————————————

type ReviewStage = Extract<Stage, { name: "review" }>;

function ReviewForm({
  stage,
  onCancel,
  onSave,
}: {
  stage: ReviewStage;
  onCancel: () => void;
  onSave: (input: CreateFromContractInput) => void | Promise<void>;
}) {
  const { extracted, venueMatch, producerMatch, blobUrl, fileName } = stage;

  // — Venue —
  // If the matcher found an exact / address / fuzzy match, default to
  // "use existing"; otherwise "create new". Patrick can override on the
  // fuzzy path (offered as a suggestion, not enforced).
  const [useExistingVenue, setUseExistingVenue] = useState(
    venueMatch.kind === "exact" || venueMatch.kind === "address",
  );
  const existingVenueId =
    venueMatch.kind === "exact" ||
    venueMatch.kind === "address" ||
    venueMatch.kind === "fuzzy"
      ? venueMatch.venueId
      : null;

  const [venueName, setVenueName] = useState(extracted.venue.name);
  const [venueStreet, setVenueStreet] = useState(extracted.venue.street ?? "");
  const [venueCity, setVenueCity] = useState(extracted.venue.city ?? "");
  const [venueState, setVenueState] = useState(extracted.venue.state ?? "");
  const [venueZip, setVenueZip] = useState(extracted.venue.zip ?? "");

  // — Event date / times —
  const [date, setDate] = useState(extracted.event.date ?? "");
  const [downbeatTime, setDownbeatTime] = useState(
    extracted.event.downbeatTime ?? "",
  );
  const [loadInTime, setLoadInTime] = useState(extracted.event.loadInTime ?? "");
  const [endTime, setEndTime] = useState(extracted.event.endTime ?? "");

  // — Producer —
  const [useExistingProducer, setUseExistingProducer] = useState(
    producerMatch.kind === "email" || producerMatch.kind === "name-phone",
  );
  const existingProducerId =
    producerMatch.kind === "email" ||
    producerMatch.kind === "name-phone" ||
    producerMatch.kind === "name-only"
      ? producerMatch.producerId
      : null;

  const [attachProducer, setAttachProducer] = useState(
    producerMatch.kind !== "none",
  );
  const [producerName, setProducerName] = useState(extracted.producer.name ?? "");
  const [producerEmail, setProducerEmail] = useState(extracted.producer.email ?? "");
  const [producerPhone, setProducerPhone] = useState(extracted.producer.phone ?? "");
  const [producerCompany, setProducerCompany] = useState(
    extracted.producer.company ?? "",
  );

  // Prefill notes with anything Claude flagged as "not part of the
  // schema" — cancellation policy language, dress code, sound-check
  // requirements. Patrick can trim before saving.
  const [notes, setNotes] = useState(
    extracted.unrecognizedFields.length
      ? extracted.unrecognizedFields.join("\n")
      : "",
  );

  const [pending, startTransition] = useTransition();
  const [validation, setValidation] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!date) {
      setValidation("Event date is required.");
      return;
    }
    if (useExistingVenue && !existingVenueId) {
      setValidation("Pick a venue or create a new one.");
      return;
    }
    if (!useExistingVenue && !venueName.trim()) {
      setValidation("New venue needs a name.");
      return;
    }
    setValidation(null);

    const input: CreateFromContractInput = {
      contractUrl: blobUrl,
      contractFileName: fileName,
      venueId: useExistingVenue ? existingVenueId ?? undefined : undefined,
      venueNew: useExistingVenue
        ? undefined
        : {
            name: venueName.trim(),
            addressL1: venueStreet.trim() || null,
            city: venueCity.trim() || null,
            state: venueState.trim() || null,
            postalCode: venueZip.trim() || null,
          },
      producerId:
        attachProducer && useExistingProducer
          ? existingProducerId ?? undefined
          : undefined,
      producerNew:
        attachProducer && !useExistingProducer && producerName.trim()
          ? {
              name: producerName.trim(),
              email: producerEmail.trim() || null,
              phone: producerPhone.trim() || null,
              company: producerCompany.trim() || null,
            }
          : undefined,
      date,
      loadInTime: loadInTime || null,
      downbeatTime: downbeatTime || null,
      endTime: endTime || null,
      notes: notes.trim() || null,
    };
    startTransition(() => {
      void onSave(input);
    });
  }

  const confBadge =
    extracted.confidence === "high" ? (
      <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
        High confidence
      </span>
    ) : extracted.confidence === "medium" ? (
      <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warn">
        Medium confidence &mdash; double-check
      </span>
    ) : (
      <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
        Low confidence &mdash; verify everything
      </span>
    );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between rounded-md border border-line bg-paper px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">
            📄 {fileName}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-mute">
            Saved with the new gig once you click Save.
          </div>
        </div>
        <div className="ml-4 shrink-0">{confBadge}</div>
      </div>

      {/* Venue */}
      <FormSection title="Venue">
        <VenuePicker
          match={venueMatch}
          useExisting={useExistingVenue}
          setUseExisting={setUseExistingVenue}
          venueName={venueName}
          setVenueName={setVenueName}
          venueStreet={venueStreet}
          setVenueStreet={setVenueStreet}
          venueCity={venueCity}
          setVenueCity={setVenueCity}
          venueState={venueState}
          setVenueState={setVenueState}
          venueZip={venueZip}
          setVenueZip={setVenueZip}
        />
      </FormSection>

      {/* Date + times */}
      <FormSection title="Date &amp; times">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Event date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputStyles}
            />
          </Field>
          <Field label="Load in">
            <input
              type="time"
              value={loadInTime}
              onChange={(e) => setLoadInTime(e.target.value)}
              className={inputStyles}
            />
          </Field>
          <Field label="Downbeat">
            <input
              type="time"
              value={downbeatTime}
              onChange={(e) => setDownbeatTime(e.target.value)}
              className={inputStyles}
            />
          </Field>
          <Field label="End time">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputStyles}
            />
          </Field>
        </div>
      </FormSection>

      {/* Producer */}
      <FormSection title="Producer (client contact)">
        <ProducerPicker
          match={producerMatch}
          attach={attachProducer}
          setAttach={setAttachProducer}
          useExisting={useExistingProducer}
          setUseExisting={setUseExistingProducer}
          producerName={producerName}
          setProducerName={setProducerName}
          producerEmail={producerEmail}
          setProducerEmail={setProducerEmail}
          producerPhone={producerPhone}
          setProducerPhone={setProducerPhone}
          producerCompany={producerCompany}
          setProducerCompany={setProducerCompany}
        />
      </FormSection>

      {/* Notes — pre-populated with anything Claude flagged as extra. */}
      <FormSection title="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Cancellation policy, sound-check requirements, dress code&hellip;"
          className={`${inputStyles} min-h-[100px] resize-y font-serif leading-[1.55]`}
        />
        <div className="mt-1 text-[11px] text-ink-mute">
          Pre-filled from anything in the contract we couldn&apos;t map to a
          field. Edit or clear as you like.
        </div>
      </FormSection>

      {validation && (
        <div className="rounded-md border border-accent/40 bg-accent-soft/50 px-4 py-2 text-[13px] text-accent">
          {validation}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-[13px] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
        >
          Discard, start over
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-[13px] font-semibold text-paper transition-colors hover:bg-accent/90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save gig"}
        </button>
      </div>
    </form>
  );
}

// ————————————————————————————————————————————————————————————————
// Field + section primitives
// ————————————————————————————————————————————————————————————————

const inputStyles =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none";

function FormSection({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 font-serif text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </div>
      {children}
    </label>
  );
}

// ————————————————————————————————————————————————————————————————
// Venue picker — respects the matcher result
// ————————————————————————————————————————————————————————————————

function VenuePicker(props: {
  match: VenueMatch;
  useExisting: boolean;
  setUseExisting: (v: boolean) => void;
  venueName: string;
  setVenueName: (v: string) => void;
  venueStreet: string;
  setVenueStreet: (v: string) => void;
  venueCity: string;
  setVenueCity: (v: string) => void;
  venueState: string;
  setVenueState: (v: string) => void;
  venueZip: string;
  setVenueZip: (v: string) => void;
}) {
  const { match } = props;

  // Exact or address match — one-line confirmation, small "different venue"
  // escape hatch. This is the happy path for repeat venues.
  if (
    (match.kind === "exact" || match.kind === "address") &&
    props.useExisting
  ) {
    return (
      <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-success">
          Matched existing venue
        </div>
        <div className="mt-1 font-serif text-[18px] text-ink">
          {match.venueName}
        </div>
        <button
          type="button"
          onClick={() => props.setUseExisting(false)}
          className="mt-2 text-[11.5px] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
        >
          Not this one &mdash; create new
        </button>
      </div>
    );
  }

  // Fuzzy match — two clear options.
  if (match.kind === "fuzzy") {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-[1.5] text-ink">
          Did you mean{" "}
          <strong className="font-serif text-[15px]">{match.venueName}</strong>?
          The contract says <em>&ldquo;{match.suggestion}&rdquo;</em>.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => props.setUseExisting(true)}
            className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors ${
              props.useExisting
                ? "border-accent bg-accent text-paper"
                : "border-line bg-paper text-ink hover:border-accent"
            }`}
          >
            Use {match.venueName}
          </button>
          <button
            type="button"
            onClick={() => props.setUseExisting(false)}
            className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors ${
              !props.useExisting
                ? "border-accent bg-accent text-paper"
                : "border-line bg-paper text-ink hover:border-accent"
            }`}
          >
            Create new
          </button>
        </div>
        {!props.useExisting && <NewVenueFields {...props} />}
      </div>
    );
  }

  // No match, OR user overrode a match — show the new-venue form.
  return <NewVenueFields {...props} />;
}

function NewVenueFields(props: {
  venueName: string;
  setVenueName: (v: string) => void;
  venueStreet: string;
  setVenueStreet: (v: string) => void;
  venueCity: string;
  setVenueCity: (v: string) => void;
  venueState: string;
  setVenueState: (v: string) => void;
  venueZip: string;
  setVenueZip: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute">
        Creating new venue
      </div>
      <Field label="Venue name">
        <input
          value={props.venueName}
          onChange={(e) => props.setVenueName(e.target.value)}
          required
          className={inputStyles}
        />
      </Field>
      <Field label="Street">
        <input
          value={props.venueStreet}
          onChange={(e) => props.setVenueStreet(e.target.value)}
          className={inputStyles}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="City">
          <input
            value={props.venueCity}
            onChange={(e) => props.setVenueCity(e.target.value)}
            className={inputStyles}
          />
        </Field>
        <Field label="State">
          <input
            value={props.venueState}
            onChange={(e) => props.setVenueState(e.target.value)}
            className={inputStyles}
          />
        </Field>
        <Field label="ZIP">
          <input
            value={props.venueZip}
            onChange={(e) => props.setVenueZip(e.target.value)}
            className={inputStyles}
          />
        </Field>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Producer picker
// ————————————————————————————————————————————————————————————————

function ProducerPicker(props: {
  match: ProducerMatch;
  attach: boolean;
  setAttach: (v: boolean) => void;
  useExisting: boolean;
  setUseExisting: (v: boolean) => void;
  producerName: string;
  setProducerName: (v: string) => void;
  producerEmail: string;
  setProducerEmail: (v: string) => void;
  producerPhone: string;
  setProducerPhone: (v: string) => void;
  producerCompany: string;
  setProducerCompany: (v: string) => void;
}) {
  const { match } = props;

  // Nothing extractable — offer manual entry via a toggle.
  if (match.kind === "none") {
    if (!props.attach) {
      return (
        <div className="rounded-md border border-line bg-paper-warm/40 px-4 py-3 text-[13px] text-ink-mute">
          No client contact detected in the contract.{" "}
          <button
            type="button"
            onClick={() => props.setAttach(true)}
            className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            Add one manually
          </button>
        </div>
      );
    }
    return (
      <NewProducerFields {...props} onSkip={() => props.setAttach(false)} />
    );
  }

  // Confirmed email or name+phone match — one-line, with option to
  // opt out of attaching.
  if (
    (match.kind === "email" || match.kind === "name-phone") &&
    props.useExisting
  ) {
    return (
      <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-success">
          Matched existing producer
        </div>
        <div className="mt-1 font-serif text-[18px] text-ink">
          {match.producerName}
        </div>
        {match.kind === "email" && (
          <div className="text-[12px] text-ink-mute">{match.producerEmail}</div>
        )}
        <button
          type="button"
          onClick={() => props.setUseExisting(false)}
          className="mt-2 text-[11.5px] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
        >
          Different person &mdash; create new
        </button>
      </div>
    );
  }

  // Name-only match — likely but not certain. Offer both paths.
  if (match.kind === "name-only") {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-[1.5] text-ink">
          There&apos;s an existing producer named{" "}
          <strong className="font-serif text-[15px]">{match.producerName}</strong>.
          Same person, or a different one with the same name?
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => props.setUseExisting(true)}
            className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors ${
              props.useExisting
                ? "border-accent bg-accent text-paper"
                : "border-line bg-paper text-ink hover:border-accent"
            }`}
          >
            Same person
          </button>
          <button
            type="button"
            onClick={() => props.setUseExisting(false)}
            className={`flex-1 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors ${
              !props.useExisting
                ? "border-accent bg-accent text-paper"
                : "border-line bg-paper text-ink hover:border-accent"
            }`}
          >
            Different person &mdash; create new
          </button>
        </div>
        {!props.useExisting && <NewProducerFields {...props} />}
      </div>
    );
  }

  // Default: no match found (kind === "new"), or the user overrode a
  // match. Show the new-producer form.
  return <NewProducerFields {...props} />;
}

function NewProducerFields(props: {
  producerName: string;
  setProducerName: (v: string) => void;
  producerEmail: string;
  setProducerEmail: (v: string) => void;
  producerPhone: string;
  setProducerPhone: (v: string) => void;
  producerCompany: string;
  setProducerCompany: (v: string) => void;
  onSkip?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-mute">
          Adding to your producers list
        </div>
        {props.onSkip && (
          <button
            type="button"
            onClick={props.onSkip}
            className="text-[11px] text-ink-mute underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent"
          >
            Skip
          </button>
        )}
      </div>
      <Field label="Name">
        <input
          value={props.producerName}
          onChange={(e) => props.setProducerName(e.target.value)}
          className={inputStyles}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Email">
          <input
            type="email"
            value={props.producerEmail}
            onChange={(e) => props.setProducerEmail(e.target.value)}
            className={inputStyles}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={props.producerPhone}
            onChange={(e) => props.setProducerPhone(e.target.value)}
            className={inputStyles}
          />
        </Field>
      </div>
      <Field label="Company / organization">
        <input
          value={props.producerCompany}
          onChange={(e) => props.setProducerCompany(e.target.value)}
          className={inputStyles}
        />
      </Field>
    </div>
  );
}

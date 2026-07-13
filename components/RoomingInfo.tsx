"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { updateGigField, saveRoomingUploaded } from "@/lib/actions/gigs";

// Rooming info editor. The bandleader picks ONE of two forms per gig:
//   • Text — typed notes ("Hampton Inn, 2 queens · Patrick+Joe / Tony solo").
//     Saves to roomingInfo via updateGigField, same commit path as the other
//     inline text fields.
//   • PDF  — an uploaded rooming-list document (PDF or a photo of a printed
//     sheet). Same client-first upload+commit pattern as StagePlotUpload,
//     saving roomingUrl + roomingFileName.
// A segmented toggle switches between the two. Switching modes never deletes
// the other form's data — it just changes which input is shown — so a leader
// can keep a PDF on file while jotting a quick text note, and vice versa. The
// initial tab is whichever form already has data (PDF wins if both do), else
// Text.
export function RoomingInfo({
  gigId,
  initialInfo,
  initialUrl,
  initialFileName,
}: {
  gigId: string;
  initialInfo: string | null;
  initialUrl: string | null;
  initialFileName: string | null;
}) {
  const [mode, setMode] = useState<"text" | "pdf">(
    initialUrl ? "pdf" : "text",
  );

  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-line bg-paper p-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]">
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`rounded px-3 py-1 transition-colors ${
            mode === "text"
              ? "bg-accent text-paper"
              : "text-ink-mute hover:text-accent"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => setMode("pdf")}
          className={`rounded px-3 py-1 transition-colors ${
            mode === "pdf"
              ? "bg-accent text-paper"
              : "text-ink-mute hover:text-accent"
          }`}
        >
          PDF
        </button>
      </div>

      {mode === "text" ? (
        <RoomingText gigId={gigId} initialInfo={initialInfo} />
      ) : (
        <RoomingUpload
          gigId={gigId}
          initialUrl={initialUrl}
          initialFileName={initialFileName}
        />
      )}
    </div>
  );
}

// Click-to-edit textarea for the typed rooming note. Mirrors InlineField's
// multiline behaviour (blur or ⌘↵ saves, Escape cancels) but is inlined here
// so the toggle owns the whole rooming block.
function RoomingText({
  gigId,
  initialInfo,
}: {
  gigId: string;
  initialInfo: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialInfo ?? "");
  const [saved, setSaved] = useState<string | null>(initialInfo);
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === (saved ?? "")) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateGigField(gigId, "roomingInfo", trimmed === "" ? null : trimmed);
      setSaved(trimmed === "" ? null : trimmed);
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          if (e.key === "Escape") {
            setValue(saved ?? "");
            setEditing(false);
          }
        }}
        rows={4}
        disabled={pending}
        placeholder="e.g. Hampton Inn Downtown · 2 queens · Patrick + Joe / Tony solo · check-in 3 PM"
        className="w-full resize-y rounded-md border border-line-strong bg-paper px-3 py-2 text-[13px] leading-[1.5] text-ink outline-none focus:border-accent"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full whitespace-pre-wrap rounded-md border border-transparent px-3 py-2 text-left text-[13px] leading-[1.5] hover:border-line hover:bg-paper-warm"
    >
      {saved ? (
        <span className="text-ink">{saved}</span>
      ) : (
        <span className="text-ink-mute">
          Add rooming notes — hotel, room assignments, check-in…
        </span>
      )}
    </button>
  );
}

// Upload path — identical mechanics to StagePlotUpload, retargeted at the
// rooming route + fields.
function RoomingUpload({
  gigId,
  initialUrl,
  initialFileName,
}: {
  gigId: string;
  initialUrl: string | null;
  initialFileName: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [fileName, setFileName] = useState(initialFileName);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      setError("Rooming list must be a PDF or image (PNG, JPG, WebP, HEIC)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File is larger than 10 MB");
      return;
    }
    setProgress(0);
    let blobUrl: string | null = null;
    try {
      const pathname = `rooming/${gigId}/${Date.now()}-${sanitize(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/rooming",
        clientPayload: JSON.stringify({ gigId }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      blobUrl = blob.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
      return;
    }

    setProgress(null);
    setSaving(true);
    try {
      await saveRoomingUploaded(gigId, blobUrl, file.name);
      setUrl(blobUrl);
      setFileName(file.name);
      setSaving(false);
      router.refresh();
    } catch (err) {
      setSaving(false);
      setError(
        `Saved to storage but failed to attach to the gig: ${
          err instanceof Error ? err.message : "unknown error"
        }. The file URL is: ${blobUrl}`,
      );
    }
  }

  function remove() {
    startTransition(async () => {
      // Clearing roomingUrl also clears roomingFileName — handled inside
      // updateGigField. One server round-trip, one Activity entry.
      await updateGigField(gigId, "roomingUrl", null);
      setUrl(null);
      setFileName(null);
      router.refresh();
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  // Uploaded state: PDF gets an icon row, image gets a preview thumbnail.
  if (url && progress === null) {
    const isPdf = /\.pdf($|\?)/i.test(url);
    const display =
      fileName ?? url.split("/").pop()?.split("?")[0]?.replace(/^\d+-/, "") ??
      "rooming-list";
    return (
      <div>
        <div className="overflow-hidden rounded-md border border-line bg-paper">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block"
            title="Open full size"
          >
            {isPdf ? (
              <div className="flex items-center gap-3 bg-paper-warm px-5 py-6">
                <span className="text-[28px]">🛏️</span>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-ink">
                    {display}
                  </span>
                  <span className="text-[11px] text-ink-mute">
                    PDF · click to open
                  </span>
                </div>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt="Rooming list"
                className="h-auto w-full max-h-[280px] object-contain bg-paper-warm"
              />
            )}
          </a>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px]">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-mute hover:text-accent"
            >
              Open full size ↗
            </a>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold uppercase tracking-[0.1em] text-ink-mute hover:text-accent"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="font-semibold uppercase tracking-[0.1em] text-ink-mute hover:text-accent disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={onPick}
          className="hidden"
        />
        {error && <div className="mt-2 text-[11px] text-accent">{error}</div>}
      </div>
    );
  }

  if (saving) {
    return (
      <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
        <div className="text-[12px] font-medium text-accent">
          Saving to gig…
        </div>
      </div>
    );
  }

  if (progress !== null) {
    return (
      <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
        <div className="mb-2 text-[12px] font-medium text-accent">
          Uploading&hellip; {progress}%
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/10">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/10"
            : "border-line-strong bg-paper hover:border-accent hover:bg-accent/5"
        }`}
      >
        <div className="text-[12px] font-medium text-ink">
          Upload rooming list
        </div>
        <div className="text-[11px] text-ink-mute">
          Drag &amp; drop or click · PDF, PNG, JPG, WebP, HEIC · 10 MB max
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onPick}
        className="hidden"
      />
      {error && <div className="mt-2 text-[11px] text-accent">{error}</div>}
    </div>
  );
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

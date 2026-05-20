"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { updateGigField, saveStagePlotUploaded } from "@/lib/actions/gigs";

// Stage-plot uploader. Accepts PDFs (most stage plots arrive as a PDF from a
// production rider) AND images (PNG/JPG/WebP/HEIC) for hand-drawn plots
// photographed off a napkin. Same client-first commit pattern as
// LoadingMapUpload — see comment in that file for the full rationale.
// Once uploaded, the URL + filename stick to the gig until explicitly
// replaced or removed.
export function StagePlotUpload({
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
      setError("Stage plot must be a PDF or image (PNG, JPG, WebP, HEIC)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File is larger than 10 MB");
      return;
    }
    setProgress(0);
    let blobUrl: string | null = null;
    try {
      const pathname = `stage-plots/${gigId}/${Date.now()}-${sanitize(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/stage-plot",
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
      await saveStagePlotUploaded(gigId, blobUrl, file.name);
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
      // Clearing stagePlotUrl also clears stagePlotFileName — handled
      // inside updateGigField. One server round-trip, one Activity entry.
      await updateGigField(gigId, "stagePlotUrl", null);
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
  // Same affordances as LoadingMapUpload: open-fullsize / replace / remove.
  if (url && progress === null) {
    const isPdf = /\.pdf($|\?)/i.test(url);
    const display =
      fileName ?? url.split("/").pop()?.split("?")[0]?.replace(/^\d+-/, "") ??
      "stage-plot";
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
                <span className="text-[28px]">📄</span>
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
                alt="Stage plot"
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
        <div className="text-[12px] font-medium text-ink">Upload stage plot</div>
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

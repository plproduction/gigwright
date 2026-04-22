"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { updateGigField } from "@/lib/actions/gigs";

// Image uploader for the per-gig loading map. Streams the image straight to
// Vercel Blob; on completion, the /api/upload/loading-map hook writes the
// URL to gig.loadingMapUrl. Also offers a "Remove" affordance once uploaded.
export function LoadingMapUpload({
  gigId,
  initialUrl,
}: {
  gigId: string;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Map must be an image (PNG, JPG, WebP, HEIC)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image is larger than 10 MB");
      return;
    }
    setProgress(0);
    try {
      const pathname = `loading-maps/${gigId}/${Date.now()}-${sanitize(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/loading-map",
        clientPayload: JSON.stringify({ gigId }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      setUrl(blob.url);
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  function remove() {
    startTransition(async () => {
      await updateGigField(gigId, "loadingMapUrl", null);
      setUrl(null);
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

  // Uploaded state: image preview + replace/remove controls
  if (url && progress === null) {
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Loading map"
              className="h-auto w-full max-h-[280px] object-contain bg-paper-warm"
            />
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
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
        {error && <div className="mt-2 text-[11px] text-accent">{error}</div>}
      </div>
    );
  }

  // Uploading state
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

  // Empty state
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
          Upload map image
        </div>
        <div className="text-[11px] text-ink-mute">
          Drag &amp; drop or click · PNG, JPG, WebP, HEIC · 10 MB max
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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

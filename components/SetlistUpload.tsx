"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

// Drag-drop / click-to-pick PDF uploader for a gig's set list. Streams the
// file straight from the browser to Vercel Blob (never through our server),
// then the /api/upload/setlist onUploadCompleted hook writes the URL and
// filename to the gig record.
export function SetlistUpload({
  gigId,
  initialUrl,
  initialFileName,
}: {
  gigId: string;
  initialUrl: string | null;
  initialFileName: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [fileName, setFileName] = useState(initialFileName);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Set list must be a PDF");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("PDF is larger than 20 MB");
      return;
    }
    setProgress(0);
    try {
      const pathname = `setlists/${gigId}/${Date.now()}-${sanitize(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/setlist",
        clientPayload: JSON.stringify({ gigId }),
        onUploadProgress: (e) => {
          // Vercel's progress callback: { loaded, total, percentage }
          setProgress(Math.round(e.percentage));
        },
      });
      setUrl(blob.url);
      setFileName(file.name);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = ""; // allow reselecting the same file
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  // Uploaded state: clickable link + replace button
  if (url && progress === null) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper p-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            📄 {fileName ?? "Set list"}
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute hover:text-accent"
          >
            Replace
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={onPick}
          className="hidden"
        />
        {error && (
          <div className="mt-2 text-[11px] text-accent">{error}</div>
        )}
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

  // Empty state: click or drag-drop
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
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-5 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/10"
            : "border-line-strong bg-paper hover:border-accent hover:bg-accent/5"
        }`}
      >
        <div className="text-[13px] font-medium text-ink">
          Upload PDF set list
        </div>
        <div className="text-[11px] text-ink-mute">
          Drag &amp; drop or click to pick · PDF only, 20 MB max
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
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

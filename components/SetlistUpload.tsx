"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { saveSetlistUploaded, clearSetlist } from "@/lib/actions/gigs";

// Drag-drop / click-to-pick PDF uploader for a gig's set list. Streams the
// file straight from the browser to Vercel Blob, then commits the resulting
// URL onto the gig record via the saveSetlistUploaded server action.
//
// We DON'T rely on the @vercel/blob onUploadCompleted webhook for the DB
// write. That hook proved unreliable in production — uploads kept
// "disappearing" because the webhook never reached our Netlify-hosted
// route, so the gig record was never updated. Instead, after upload()
// resolves on the client we explicitly call the server action with the
// blob URL. The browser has cookies, so requireUser() inside the action
// works, and the URL gets persisted as part of the same user gesture
// that did the upload. Once saved, the URL stays on the gig until the
// user explicitly replaces it.
export function SetlistUpload({
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [removing, startRemove] = useTransition();

  function handleRemove() {
    if (!url) return;
    // Confirm before clearing — accidental click on Remove right next
    // to Replace would otherwise wipe the upload silently.
    const ok = window.confirm(
      "Remove this set list from the gig? The file stays in storage; the gig will go back to the empty upload state.",
    );
    if (!ok) return;
    startRemove(async () => {
      try {
        await clearSetlist(gigId);
        setUrl(null);
        setFileName(null);
        setError(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Remove failed");
      }
    });
  }

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
    let blobUrl: string | null = null;
    try {
      const pathname = `setlists/${gigId}/${Date.now()}-${sanitize(file.name)}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/setlist",
        clientPayload: JSON.stringify({ gigId, fileName: file.name }),
        onUploadProgress: (e) => {
          // Vercel's progress callback: { loaded, total, percentage }
          setProgress(Math.round(e.percentage));
        },
      });
      blobUrl = blob.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
      return;
    }

    // Upload to Blob succeeded. Now commit the URL to the gig record.
    // Treat this as its own phase with its own error message so a save
    // failure doesn't silently masquerade as a successful upload.
    setProgress(null);
    setSaving(true);
    try {
      await saveSetlistUploaded(gigId, blobUrl, file.name);
      setUrl(blobUrl);
      setFileName(file.name);
      setSaving(false);
      // Re-fetch the page so server-rendered sections (activity log,
      // notification timestamps, etc.) reflect the upload immediately.
      router.refresh();
    } catch (err) {
      setSaving(false);
      // Crucial: the file is on Blob storage but the gig record didn't
      // get the URL. Show a strong, persistent error and the URL so the
      // user can recover or copy/paste the URL into a support message.
      setError(
        `Saved to storage but failed to attach to the gig: ${
          err instanceof Error ? err.message : "unknown error"
        }. The file URL is: ${blobUrl}`,
      );
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
            disabled={removing}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute hover:text-accent disabled:opacity-50"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute hover:text-accent disabled:opacity-50"
            title="Detach this set list from the gig"
          >
            {removing ? "Removing…" : "Remove"}
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

  // Saving state — upload finished, now waiting for the gig record to
  // commit. Distinct from the upload progress so the user can see whether
  // a hang is on the network upload or the DB save.
  if (saving) {
    return (
      <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
        <div className="text-[12px] font-medium text-accent">
          Saving to gig…
        </div>
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

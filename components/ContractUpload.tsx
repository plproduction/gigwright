"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { saveContractUploaded, removeContract } from "@/lib/actions/gigs";

// Bandleader-only contract upload for a specific gig. PDF (or image) via
// direct-to-Blob upload; the URL + original filename land on the gig
// record and stay there until the bandleader replaces them or removes
// them. Same shape as SetlistUpload but never fires an activity entry
// or notifies the band — this is Patrick's own paperwork drawer.
//
// Auth is enforced twice: the API route verifies gig ownership before
// signing the upload token, and the client also calls a server action
// after upload() resolves to save the URL immediately (the webhook
// completion path is a backup, per the same pattern used by setlist).
export function ContractUpload({
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
  const [removing, startRemoving] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    setError(null);
    const kind = file.type;
    const acceptable = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif",
    ];
    if (!acceptable.includes(kind)) {
      setError("Contract must be a PDF or image");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Contract must be under 25 MB");
      return;
    }
    setProgress(0);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const pathname = `contracts/${gigId}/${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/contract",
        clientPayload: JSON.stringify({ gigId, fileName: file.name }),
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      // Commit the URL immediately via server action — don't rely on
      // Vercel Blob's completion webhook alone.
      try {
        await saveContractUploaded(gigId, blob.url, file.name);
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : "unknown";
        setError(`Uploaded but couldn't save to gig: ${msg}`);
        setProgress(null);
        return;
      }
      setUrl(blob.url);
      setFileName(file.name);
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function handleRemove() {
    startRemoving(async () => {
      try {
        await removeContract(gigId);
        setUrl(null);
        setFileName(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Remove failed");
      }
    });
  }

  // Uploaded state: link + refresh + remove icons (same visual
  // language as the SetlistUpload / InlineField link mode).
  if (url && progress === null) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line bg-paper p-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          📄 {fileName ?? "Contract"}
        </a>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={removing}
          aria-label="Replace this contract"
          title="Replace with a different file"
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[13px] leading-none text-ink-mute transition-colors hover:border-accent hover:bg-accent hover:text-paper disabled:opacity-30"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          aria-label="Remove this contract"
          title="Remove from this gig"
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[14px] leading-none text-ink-mute transition-colors hover:border-accent hover:bg-accent hover:text-paper disabled:opacity-30"
        >
          {removing ? "…" : "✕"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
          onChange={onPick}
          className="hidden"
        />
      </div>
    );
  }

  // Empty / uploading state: same click-or-drop affordance shape as
  // SetlistUpload so the two feel like siblings.
  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        className={`cursor-pointer rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-paper-warm/40 hover:border-accent/50 hover:bg-paper-warm/70"
        }`}
      >
        {progress !== null ? (
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              Uploading… {progress}%
            </div>
            <div className="h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="text-[13px] font-medium text-ink">
              Upload signed contract
            </div>
            <div className="mt-1 text-[11px] text-ink-mute">
              Drag &amp; drop or click to pick · PDF or image · 25 MB max
            </div>
          </>
        )}
      </div>
      {error && (
        <div className="mt-2 text-[11px] text-accent">{error}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}

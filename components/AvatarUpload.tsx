"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

// Photo uploader for a musician's roster card. Click or drag-drop an image.
// Streams from the browser straight to Vercel Blob, then the API route writes
// the URL onto the musician. Small round preview + "Change" / "Remove".
export function AvatarUpload({
  musicianId,
  musicianName,
  initialUrl,
  initials,
}: {
  musicianId: string;
  musicianName: string;
  initialUrl: string | null;
  initials: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("File must be an image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB");
      return;
    }
    setProgress(0);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const pathname = `avatars/${musicianId}/${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload/avatar",
        clientPayload: JSON.stringify({ musicianId }),
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

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-deep text-[18px] font-semibold text-ink-soft"
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={musicianName}
            className="h-full w-full object-cover"
          />
        ) : (
          initials
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-line-strong bg-transparent px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-accent hover:bg-accent hover:text-paper"
        >
          {url ? "Change photo" : "Upload photo"}
        </button>
        {progress !== null && (
          <span className="text-[11px] text-accent">
            Uploading… {progress}%
          </span>
        )}
        {error && <span className="text-[11px] text-accent">{error}</span>}
        <span className="text-[11px] text-ink-mute">
          PNG, JPG, or HEIC · up to 10 MB
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}

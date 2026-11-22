"use client";

import { useRef, useState } from "react";

type SignaturePadProps = {
  // Hidden input name the enclosing <form> submits — a data: URL PNG of
  // whatever's drawn, or empty string if nothing's been drawn yet. The
  // server action re-validates "non-empty" rather than trusting the
  // client drew anything real.
  fieldName: string;
};

export function SignaturePad({ fieldName }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    lastPoint.current = getPoint(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const point = getPoint(e);
    const last = lastPoint.current ?? point;
    ctx.strokeStyle = "#2B2B2B";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    if (!hasDrawn) setHasDrawn(true);
  }

  function end() {
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas) setDataUrl(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setDataUrl("");
    setHasDrawn(false);
  }

  return (
    <div>
      <input type="hidden" name={fieldName} value={dataUrl} />
      <div className="rounded-md border border-contract-rule bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="h-[120px] w-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
          Draw your signature above
        </span>
        {hasDrawn && (
          <button
            type="button"
            onClick={clear}
            className="font-sans text-[10px] font-medium text-contract-gold underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-4 h-px bg-contract-ink" />
      <div className="mt-1 font-sans text-[9px] tracking-[0.18em] text-contract-soft uppercase">
        Authorized signature
      </div>
    </div>
  );
}

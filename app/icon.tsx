import { ImageResponse } from "next/og";

// Programmatic favicon. Next serves this at /icon automatically so we don't
// need a favicon.ico bundled. Uses the brand palette: ink paper over accent.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7E2418",
          color: "#FBFAF6",
          fontWeight: 400,
          fontFamily: "serif",
          letterSpacing: "-0.03em",
        }}
      >
        G
      </div>
    ),
    { ...size },
  );
}

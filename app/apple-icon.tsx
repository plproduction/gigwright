import { ImageResponse } from "next/og";

// Apple touch icon for iOS "Add to Home Screen". Same brand palette as the
// web icon, sized to 180×180 per Apple's guidance.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 120,
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

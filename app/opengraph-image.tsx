import { ImageResponse } from "next/og";

// Social preview image served at /opengraph-image. 1200×630 is the standard
// OG size and also what Twitter uses for summary_large_image.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GigWright · Booking management built by a working bandleader";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#FBFAF6",
          color: "#0E0C09",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          Gig
          <span style={{ color: "#7E2418", fontWeight: 300, marginLeft: 1 }}>
            Wright
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 300,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              maxWidth: 1040,
            }}
          >
            A playwright writes plays.
            <br />A{" "}
            <span style={{ color: "#7E2418", fontWeight: 300 }}>GigWright</span>{" "}
            runs gigs.
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#494336",
              lineHeight: 1.45,
              maxWidth: 960,
              fontFamily: "sans-serif",
            }}
          >
            The bandleader's workbench — from the first call to the final
            payout.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: "#857F72",
            fontFamily: "sans-serif",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          <span>gigwright.com</span>
          <span>$20 / month · 14-day trial</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

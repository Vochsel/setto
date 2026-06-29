import { ImageResponse } from "next/og";

// Route segment config
export const alt = "Setto — AI photo shoots in real places";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Image generation
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#1c1b22",
          color: "#f5f4f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#7c5cff",
              fontSize: "36px",
            }}
          >
            📷
          </div>
          <span style={{ fontSize: "40px", fontWeight: 600 }}>Setto</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "76px",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          Shoot anywhere.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "76px",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            background: "linear-gradient(to right, #8b6dff, #ff5fa8)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Generate everything.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "40px",
            fontSize: "32px",
            color: "#a8a6b3",
            maxWidth: "880px",
          }}
        >
          AI fashion shoots at real locations — staged, grounded, and generated
          from a single prompt pipeline.
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

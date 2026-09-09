import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "DressShare";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          background: "#7a2a40",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 240,
            height: 240,
            borderRadius: 48,
            background: "#fbf6f3",
            color: "#7a2a40",
            fontSize: 150,
            fontWeight: 700,
          }}
        >
          D
        </div>
        <div
          style={{
            display: "flex",
            color: "#fbf6f3",
            fontSize: 108,
            fontWeight: 700,
          }}
        >
          DressShare
        </div>
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from "next/og";

export const alt = "Airtable Clone — organize records in flexible tables";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#f8fafc",
        padding: 80,
        color: "#0f172a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 76,
            height: 76,
            borderRadius: 18,
            background: "#2563eb",
            color: "white",
            fontSize: 48,
          }}
        >
          A
        </div>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>
          Airtable Clone
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 38 }}>
        A clear space for every idea.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 20,
          fontSize: 26,
          color: "#475569",
        }}
      >
        Private workspaces · Flexible tables · Spreadsheet editing
      </div>
      <div style={{ display: "flex", marginTop: 48, gap: 12 }}>
        {["Search", "Filter", "Sort", "Copy & paste"].map((label) => (
          <div
            key={label}
            style={{
              display: "flex",
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              padding: "12px 20px",
              background: "white",
              color: "#1d4ed8",
              fontSize: 24,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}

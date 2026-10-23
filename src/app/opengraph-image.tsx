import { ImageResponse } from "next/og";
import { BRAND_RED, MARK_DATA_URI } from "@/lib/brand/mark";

// The share picture for every page (links on LinkedIn, X, iMessage, Slack):
// the mark, the manifesto's headline and the domain. ImageResponse takes
// inline styles, not Tailwind, same as tonygreenberg.com's icon.tsx.
export const alt = "SpamToast: Defend The Cathedral. Burn The Heresy.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(160deg, #f5f3ee 0%, #ede9e0 60%, #f3d9d6 100%)",
          color: "#1a1a1a",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", width: 96, height: 96, borderRadius: 22, background: BRAND_RED, alignItems: "center", justifyContent: "center" }}>
            <img src={MARK_DATA_URI} width={72} height={72} alt="" />
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 6 }}>SPAMTOAST</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>Defend The Cathedral.</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, color: BRAND_RED }}>Burn The Heresy.</div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#2c2418" }}>
            The Attention Theft Manifesto by Tony Greenberg
          </div>
        </div>
        <div style={{ fontSize: 28, color: "#6b6358" }}>spamtoast.com</div>
      </div>
    ),
    size,
  );
}

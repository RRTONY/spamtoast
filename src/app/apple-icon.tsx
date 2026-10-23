import { ImageResponse } from "next/og";
import { BRAND_RED, MARK_DATA_URI } from "@/lib/brand/mark";

// Home-screen icon for iPhone/iPad: the icon.svg mark at 180px on a full red
// square (iOS rounds the corners itself). ImageResponse takes inline styles,
// not Tailwind, same as tonygreenberg.com's icon.tsx.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_RED }}>
        <img src={MARK_DATA_URI} width={136} height={136} alt="" />
      </div>
    ),
    size,
  );
}

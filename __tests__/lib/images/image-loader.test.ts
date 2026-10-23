import { describe, expect, it } from "vitest";
import imageLoader from "@/lib/images/image-loader";

const params = (u: string) => new URL(u).searchParams;

describe("imageLoader", () => {
  it("asks Sanity for the exact width, never upscaling a width-only image", () => {
    const p = params(imageLoader({ src: "https://cdn.sanity.io/images/p/d/abc.jpg", width: 640 }));
    expect(p.get("w")).toBe("640");
    expect(p.get("fit")).toBe("max");
    expect(p.get("q")).toBe("75");
    expect(p.get("auto")).toBe("format");
  });

  it("keeps a Sanity crop's aspect ratio at the new width", () => {
    const p = params(imageLoader({ src: "https://cdn.sanity.io/images/p/d/abc.jpg?w=1200&h=630&rect=0,0,10,10", width: 600, quality: 50 }));
    expect(p.get("w")).toBe("600");
    expect(p.get("h")).toBe("315");
    expect(p.get("q")).toBe("50");
    expect(p.get("fit")).toBeNull();
    expect(p.get("rect")).toBe("0,0,10,10");
  });

  it("keeps an existing fit on Sanity", () => {
    expect(params(imageLoader({ src: "https://cdn.sanity.io/x.jpg?fit=crop", width: 100 })).get("fit")).toBe("crop");
  });

  it("returns local paths and other hosts unchanged", () => {
    expect(imageLoader({ src: "/images/default-og.png", width: 640 })).toBe("/images/default-og.png");
    expect(imageLoader({ src: "https://example.com/a.png", width: 640 })).toBe("https://example.com/a.png");
  });
});

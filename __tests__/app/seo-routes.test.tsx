import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(
      public element: unknown,
      public options: unknown,
    ) {}
  },
}));

const robots = (await import("@/app/robots")).default;
const sitemap = (await import("@/app/sitemap")).default;
const NotFound = (await import("@/app/not-found")).default;
const appleIcon = await import("@/app/apple-icon");
const og = await import("@/app/opengraph-image");
const { MARK_DATA_URI } = await import("@/lib/brand/mark");
const layout = await import("@/app/layout");

describe("SEO routes", () => {
  it("robots keeps personal links and the API out, and points at the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/youve-been-reported", "/api/"] }]);
    expect(r.sitemap).toBe("https://spamtoast.com/sitemap.xml");
  });

  it("the sitemap lists only the manifesto", () => {
    expect(sitemap().map((e) => e.url)).toEqual(["https://spamtoast.com/"]);
  });

  it("the 404 page has its own title and links home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found");
    expect(screen.getByRole("link", { name: /Read The Manifesto/ })).toHaveAttribute("href", "/");
  });

  it("the iPhone icon and share image are the right size and use the mark", () => {
    expect(appleIcon.size).toEqual({ width: 180, height: 180 });
    expect(og.size).toEqual({ width: 1200, height: 630 });
    expect(og.alt).toMatch(/SpamToast/);
    expect(JSON.stringify((appleIcon.default() as unknown as { element: unknown }).element)).toContain(MARK_DATA_URI);
    expect(JSON.stringify((og.default() as unknown as { element: unknown }).element)).toContain("Burn The Heresy.");
    expect(MARK_DATA_URI.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("the layout sets site-wide metadata and structured data", () => {
    expect(layout.metadata.title).toMatchObject({ template: "%s | SpamToast" });
    expect(layout.metadata.openGraph).toMatchObject({ siteName: "SpamToast" });
    const html = JSON.stringify(layout.default({ children: "x" } as never));
    expect(html).toContain("application/ld+json");
    expect(html).toContain("https://tonygreenberg.com/#person");
  });
});

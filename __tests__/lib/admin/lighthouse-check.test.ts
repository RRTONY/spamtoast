import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLighthouse, parseLighthouseResult } from "@/lib/admin/lighthouse-check";

const audit = (score: number | null, mode = "numeric", title = "T") => ({ title, description: "See [docs](https://x.com) for more.", score, scoreDisplayMode: mode });
const PSI = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.734, auditRefs: [{ id: "lcp" }, { id: "cls" }, { id: "missing" }] },
      accessibility: { score: 1, auditRefs: [{ id: "contrast" }, { id: "na" }, { id: "info" }] },
      "best-practices": { score: null, auditRefs: [] },
    },
    audits: {
      lcp: audit(0.2, "numeric", "Largest Contentful Paint"),
      cls: audit(0.95),
      contrast: audit(0, "binary", "Contrast"),
      na: audit(0, "notApplicable"),
      info: audit(0.1, "informative"),
    },
  },
};

describe("parseLighthouseResult", () => {
  it("rounds category scores to 0-100 and leaves missing ones null", () => {
    expect(parseLighthouseResult(PSI, "u", "mobile").scores).toEqual({ performance: 73, accessibility: 100, bestPractices: null, seo: null });
  });

  it("lists failing audits worst first, skipping passing, n/a and informative ones, with links stripped", () => {
    const { topIssues } = parseLighthouseResult(PSI, "u", "desktop");
    expect(topIssues.map((i) => [i.id, i.category, i.score])).toEqual([
      ["contrast", "accessibility", 0],
      ["lcp", "performance", 0.2],
    ]);
    expect(topIssues[0].description).toBe("See docs for more.");
  });

  it("caps the list at 10", () => {
    const audits = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`a${i}`, audit(i / 100)]));
    const data = { lighthouseResult: { categories: { seo: { score: 0.5, auditRefs: Object.keys(audits).map((id) => ({ id })) } }, audits } };
    expect(parseLighthouseResult(data, "u", "mobile").topIssues).toHaveLength(10);
  });

  it("copes with an empty response", () => {
    expect(parseLighthouseResult({}, "u", "mobile")).toEqual({ url: "u", strategy: "mobile", scores: { performance: null, accessibility: null, bestPractices: null, seo: null }, topIssues: [] });
  });
});

describe("checkLighthouse", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_API_KEY", "key123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("needs an API key", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    await expect(checkLighthouse("/")).rejects.toThrow(/GOOGLE_API_KEY is not configured/);
  });

  it("calls PageSpeed with the site URL, strategy, all four categories and the key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(PSI)));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkLighthouse("blog/x", "desktop");
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(url.searchParams.get("url")).toBe("https://spamtoast.com/blog/x");
    expect(url.searchParams.get("strategy")).toBe("desktop");
    expect(url.searchParams.getAll("category")).toEqual(["performance", "accessibility", "best-practices", "seo"]);
    expect(url.searchParams.get("key")).toBe("key123");
    expect(r.scores.performance).toBe(73);
  });

  it("reports a failed request with its status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    await expect(checkLighthouse("/")).rejects.toThrow("PageSpeed Insights request failed: 429 quota");
  });

  it("refuses a localhost site origin", async () => {
    vi.stubEnv("MCP_SITE_ORIGIN", "http://localhost:3000");
    vi.resetModules();
    const m = await import("@/lib/admin/lighthouse-check");
    await expect(m.checkLighthouse("/")).rejects.toThrow(/can't reach http:\/\/localhost:3000/);
  });
});

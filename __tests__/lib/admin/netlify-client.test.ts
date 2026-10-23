import { beforeEach, describe, expect, it, vi } from "vitest";
import { isNetlifyConfigured, isSkippedDuplicate, listDeploys, summarizeDeploy } from "@/lib/admin/netlify-client";

const SITE = "spamtoast.netlify.app";
const raw = (over: Record<string, unknown> = {}) => ({
  id: "d1", state: "ready", context: "production", branch: "main", created_at: "2026-10-16T10:00:00Z",
  published_at: "2026-10-16T10:03:00Z", deploy_time: 180, error_message: null, deploy_ssl_url: "https://spamtoast.com",
  commit_ref: "b7b6c870abcdef", title: "Merge pull request #17", skipped: null, ...over,
});

describe("netlify-client", () => {
  beforeEach(() => {
    vi.stubEnv("NETLIFY_AUTH_TOKEN", "test-token");
  });

  it("is configured only when the token is set", () => {
    expect(isNetlifyConfigured()).toBe(true);
    vi.stubEnv("NETLIFY_AUTH_TOKEN", "");
    expect(isNetlifyConfigured()).toBe(false);
  });

  it("summarizes a deploy in plain words with a short commit and this site's log link", () => {
    expect(summarizeDeploy(raw() as never)).toEqual({
      state: "ready", plain: "Built and online.", context: "production", branch: "main",
      startedAt: "2026-10-16T10:00:00Z", publishedAt: "2026-10-16T10:03:00Z", seconds: 180, error: null,
      url: "https://spamtoast.com", logUrl: "https://app.netlify.com/sites/spamtoast/deploys/d1", commit: "b7b6c87",
    });
    expect(summarizeDeploy(raw({ state: "error", error_message: "Build script returned non-zero exit code: 2" }) as never)).toMatchObject({ plain: "The build failed.", error: "Build script returned non-zero exit code: 2" });
    expect(summarizeDeploy(raw({ state: "enqueued" }) as never).plain).toBe("Waiting to build.");
    expect(summarizeDeploy(raw({ state: "weird", commit_ref: null, error_message: "" }) as never)).toMatchObject({ plain: "weird", commit: null, error: null });
  });

  it("treats Netlify's cancelled duplicate builds as skipped, not failed", () => {
    expect(isSkippedDuplicate(raw({ skipped: true }) as never)).toBe(true);
    expect(isSkippedDuplicate(raw({ state: "error", error_message: "Skipped: duplicate" }) as never)).toBe(true);
    expect(isSkippedDuplicate(raw({ state: "error", error_message: "Build failed" }) as never)).toBe(false);
    expect(isSkippedDuplicate(raw() as never)).toBe(false);
  });

  it("only GETs this one site's deploys, filtered and capped", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([raw({ id: "a" }), raw({ id: "b", skipped: true }), raw({ id: "c" })])));
    vi.stubGlobal("fetch", fetchMock);
    const out = await listDeploys({ production: true, limit: 5 });
    expect(out.map((d) => d.logUrl.split("/").pop())).toEqual(["a", "c"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.netlify.com/api/v1/sites/${SITE}/deploys?per_page=50&production=true`);
    expect(init).toEqual({ headers: { Authorization: "Bearer test-token" } });
    expect(init.method).toBeUndefined();

    await listDeploys({ branch: "admin/mcp-x", limit: 0 });
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toContain("branch=admin%2Fmcp-x");
  });

  it("uses NETLIFY_SITE_ID and NETLIFY_SITE_NAME when set", async () => {
    vi.stubEnv("NETLIFY_SITE_ID", "abc-123");
    vi.stubEnv("NETLIFY_SITE_NAME", "other-site");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([raw()])));
    vi.stubGlobal("fetch", fetchMock);
    const [d] = await listDeploys({});
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain("/sites/abc-123/deploys");
    expect(d.logUrl).toBe("https://app.netlify.com/sites/other-site/deploys/d1");
    vi.unstubAllEnvs();
  });

  it("caps the limit between 1 and 20 (default 5)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(Array.from({ length: 30 }, (_, i) => raw({ id: `d${i}` }))))));
    expect(await listDeploys({})).toHaveLength(5);
    expect(await listDeploys({ limit: 0 })).toHaveLength(1);
    expect(await listDeploys({ limit: 99 })).toHaveLength(20);
  });

  it("refuses without a token and reports a failed request", async () => {
    vi.stubEnv("NETLIFY_AUTH_TOKEN", "");
    await expect(listDeploys({})).rejects.toThrow("NETLIFY_AUTH_TOKEN is not set");
    vi.stubEnv("NETLIFY_AUTH_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(listDeploys({})).rejects.toThrow("Netlify deploys request failed (401)");
  });
});

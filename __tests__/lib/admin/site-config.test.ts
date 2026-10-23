import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND, netlifySiteId, netlifySiteName, previewUrlForPr, siteOrigin } from "@/lib/admin/site-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site-config", () => {
  it("defaults to the spamtoast Netlify site and spamtoast.com", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(BRAND).toBe("SpamToast");
    expect(netlifySiteName()).toBe("spamtoast");
    expect(netlifySiteId()).toBe("spamtoast.netlify.app");
    expect(previewUrlForPr(7)).toBe("https://deploy-preview-7--spamtoast.netlify.app");
    expect(siteOrigin()).toBe("https://spamtoast.com");
  });

  it("reads the env, ignoring unsafe or malformed values", () => {
    vi.stubEnv("NETLIFY_SITE_NAME", "other-site");
    vi.stubEnv("NETLIFY_SITE_ID", " abc-123 ");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com/");
    expect(previewUrlForPr(1)).toBe("https://deploy-preview-1--other-site.netlify.app");
    expect(netlifySiteId()).toBe("abc-123");
    expect(siteOrigin()).toBe("https://preview.example.com");
    vi.stubEnv("NETLIFY_SITE_NAME", "evil.com/x");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(netlifySiteName()).toBe("spamtoast");
    expect(siteOrigin()).toBe("https://spamtoast.com");
  });
});

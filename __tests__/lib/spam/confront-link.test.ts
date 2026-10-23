import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfrontLink, isConfrontLinkConfigured, verifyConfrontParams } from "@/lib/spam/confront-link";

const ORIGIN = "https://spamtoast.com";
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("confront links", () => {
  beforeEach(() => vi.stubEnv("CONFRONT_LINK_SECRET", "test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a signed link, normalising domain and email", () => {
    const url = createConfrontLink({ company: " Acme Leads ", domain: "ACME.io", email: "Bob@Acme.io" }, ORIGIN);
    expect(url.startsWith(`${ORIGIN}/youve-been-reported?`)).toBe(true);
    expect(verifyConfrontParams(params(url))).toEqual({ company: "Acme Leads", domain: "acme.io", email: "bob@acme.io" });
  });

  it("works with only a company", () => {
    const url = createConfrontLink({ company: "Acme" }, ORIGIN);
    expect(verifyConfrontParams(params(url))).toEqual({ company: "Acme", domain: undefined, email: undefined });
  });

  it("rejects a tampered company, a wrong or missing signature", () => {
    const p = params(createConfrontLink({ company: "Acme", email: "a@acme.io" }, ORIGIN));
    expect(verifyConfrontParams({ ...p, company: "Someone Else" })).toBeNull();
    expect(verifyConfrontParams({ ...p, sig: "x" })).toBeNull();
    expect(verifyConfrontParams({ ...p, sig: undefined })).toBeNull();
    expect(verifyConfrontParams({ ...p, company: ["Acme", "B"] })).toBeNull();
  });

  it("rejects links signed with another secret", () => {
    const p = params(createConfrontLink({ company: "Acme" }, ORIGIN));
    vi.stubEnv("CONFRONT_LINK_SECRET", "other");
    expect(verifyConfrontParams(p)).toBeNull();
  });

  it("needs a company and a secret", () => {
    expect(() => createConfrontLink({ company: "  " }, ORIGIN)).toThrow(/company/);
    vi.stubEnv("CONFRONT_LINK_SECRET", "");
    expect(isConfrontLinkConfigured()).toBe(false);
    expect(() => createConfrontLink({ company: "Acme" }, ORIGIN)).toThrow(/CONFRONT_LINK_SECRET/);
    expect(verifyConfrontParams({ company: "Acme", sig: "abc" })).toBeNull();
  });
});

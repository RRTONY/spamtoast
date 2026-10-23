import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const sendEmail = vi.fn(async () => true);
const afterFn = vi.fn((cb: () => unknown) => cb());
let userAgent = "Mozilla/5.0 (Macintosh)";
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));
vi.mock("next/server", () => ({ after: afterFn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": userAgent }) }));

const { createConfrontLink } = await import("@/lib/spam/confront-link");
const { default: Page } = await import("@/app/youve-been-reported/page");

const signed = () =>
  Object.fromEntries(new URL(createConfrontLink({ company: "Acme Leads", domain: "acme.io" }, "https://spamtoast.com")).searchParams);

async function show(params: Record<string, string>) {
  render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve(params) } as never));
}

describe("/youve-been-reported", () => {
  beforeEach(() => {
    vi.stubEnv("CONFRONT_LINK_SECRET", "test-secret");
    userAgent = "Mozilla/5.0 (Macintosh)";
  });
  afterEach(() => vi.unstubAllEnvs());

  it("names the company on a signed link and emails Tony", async () => {
    await show(signed());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Acme Leads, you've been reported.");
    expect(sendEmail).toHaveBeenCalledWith("tony@tonygreenberg.com", expect.stringContaining("Acme Leads"), expect.stringContaining("acme.io"));
  });

  it("shows the generic page and notifies nobody for a forged link", async () => {
    await show({ ...signed(), company: "Someone Else" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You've been reported.");
    expect(screen.queryByText(/Someone Else/)).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ignores link scanners and previews", async () => {
    userAgent = "Mozilla/5.0 (compatible; Googlebot/2.1)";
    await show(signed());
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("makes no fake enforcement claims", async () => {
    await show(signed());
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/invoice|filed with|will receive a copy|geolocat/i);
    expect(screen.getByRole("link", { name: /Federal Trade Commission/ })).toHaveAttribute("href", "https://reportfraud.ftc.gov/");
  });
});

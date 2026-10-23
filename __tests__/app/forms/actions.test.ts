import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn(async () => true);
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail }));

const { emailHtml, submitSpamReport } = await import("@/app/forms/actions");

const good = {
  companyName: "Acme Leads",
  senderEmail: "bob@acme.io",
  spamType: "cold-outreach",
  frequency: "weekly",
  description: "Five follow-ups after I said no.",
};

describe("submitSpamReport", () => {
  beforeEach(() => sendEmail.mockResolvedValue(true));

  it("emails Tony and succeeds", async () => {
    await expect(submitSpamReport({ ...good, reporterEmail: "me@x.com" })).resolves.toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith("tony@tonygreenberg.com", "Spam report: Acme Leads", expect.stringContaining("Five follow-ups"));
  });

  it("quietly accepts bots that fill the honeypot", async () => {
    await expect(submitSpamReport({ ...good, website: "spam" })).resolves.toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    [{ companyName: " " }, /company/],
    [{ senderEmail: "nope" }, /sender/],
    [{ spamType: "other" }, /type/],
    [{ frequency: "hourly" }, /type/],
    [{ description: "short" }, /10 characters/],
    [{ reporterEmail: "bad" }, /doesn't look right/],
  ])("rejects bad input %o", async (patch, message) => {
    const res = await submitSpamReport({ ...good, ...patch });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(message);
  });

  it("reports a failed send so the form can offer a direct email", async () => {
    sendEmail.mockResolvedValue(false);
    await expect(submitSpamReport(good)).resolves.toMatchObject({ ok: false });
  });

  it("escapes what visitors type", async () => {
    const html = await emailHtml("Hi", [["Name", "<b>x</b>"], ["Empty", ""]]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("Empty");
  });
});

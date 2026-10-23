import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/lib/email");
import { esc, sendEmail } from "@/lib/email";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "re_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false and sends nothing without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail("a@b.com", "Hi", "<p>x</p>")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend with the default sender", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail("a@b.com", "Hi", "<p>x</p>")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Only Time Buys Trust <trust@tonygreenberg.com>",
      to: "a@b.com",
      subject: "Hi",
      html: "<p>x</p>",
    });
  });

  it("uses EMAIL_FROM when set", async () => {
    vi.stubEnv("EMAIL_FROM", "Test <t@example.com>");
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail("a@b.com", "Hi", "x");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).from).toBe("Test <t@example.com>");
  });

  it("sends several recipients, a text body, a chosen sender and attachments when given", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      sendEmail(["a@b.com", "c@d.com"], "Report", "<p>Attached</p>", {
        text: "Attached",
        from: "Tony <tony@tonygreenberg.com>",
        attachments: [{ filename: "r.pdf", content: "JVBERg==" }],
      }),
    ).resolves.toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      from: "Tony <tony@tonygreenberg.com>",
      to: ["a@b.com", "c@d.com"],
      subject: "Report",
      html: "<p>Attached</p>",
      text: "Attached",
      attachments: [{ filename: "r.pdf", content: "JVBERg==" }],
    });
  });

  it("leaves out an empty attachment list", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail("a@b.com", "Hi", "x", { attachments: [] });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty("attachments");
  });

  it("returns false when Resend refuses or the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    await expect(sendEmail("a@b.com", "Hi", "x")).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(sendEmail("a@b.com", "Hi", "x")).resolves.toBe(false);
  });
});

describe("esc", () => {
  it("escapes HTML special characters", () => {
    expect(esc(`<a href="x">Tom & 'Jerry'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });

  it("leaves plain text alone", () => {
    expect(esc("hello")).toBe("hello");
  });
});

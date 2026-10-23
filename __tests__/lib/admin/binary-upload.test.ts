import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signBlob } from "@/lib/admin/mcp-oauth";
import {
  checkFileMatchesPath,
  decodeBase64,
  downloadFile,
  MAX_FETCH_BYTES,
  readUploadGrant,
  resolveBinaryInput,
  signUploadGrant,
  tooBig,
} from "@/lib/admin/binary-upload";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF = Buffer.from("%PDF-1.7");
const TOKEN = "z".repeat(40);

beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "s3cret");
  vi.stubEnv("MCP_LOGIN_PASSWORD", "pw");
  vi.stubEnv(
    "MCP_ADMIN_USERS",
    JSON.stringify([
      { name: "Kim", email: "kim@example.com", role: "edit" },
      { name: "Reader", email: "read@example.com", role: "read" },
      { name: "Bot", role: "edit", token: TOKEN },
    ]),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkFileMatchesPath", () => {
  it("accepts files whose bytes match their extension", () => {
    expect(checkFileMatchesPath("public/a.png", PNG)).toBeNull();
    expect(checkFileMatchesPath("a.JPEG", JPG)).toBeNull();
    expect(checkFileMatchesPath("doc.pdf", PDF)).toBeNull();
    expect(checkFileMatchesPath("i.svg", Buffer.from('<?xml?><svg xmlns="x">'))).toBeNull();
    expect(checkFileMatchesPath("notes.txt", Buffer.from("anything"))).toBeNull();
  });

  it("refuses an empty file or an HTML page saved as an image", () => {
    expect(checkFileMatchesPath("a.png", Buffer.alloc(0))).toBe("The file is empty.");
    expect(checkFileMatchesPath("a.png", Buffer.from("<html>login</html>"))).toMatch(/isn't a real \.png/);
    expect(checkFileMatchesPath("a.jpg", PNG)).toMatch(/isn't a real \.jpg/);
  });
});

describe("decodeBase64", () => {
  it("decodes plain and data-URL base64, ignoring whitespace", () => {
    const b64 = PNG.toString("base64");
    expect(decodeBase64(b64)).toEqual({ ok: true, bytes: PNG });
    expect(decodeBase64(`data:image/png;base64,${b64.slice(0, 4)}\n${b64.slice(4)}`)).toEqual({ ok: true, bytes: PNG });
  });

  it("refuses empty or invalid base64 with the upload-link hint", () => {
    expect(decodeBase64("")).toEqual({ ok: false, error: "base64Content is empty." });
    const bad = decodeBase64("[image attached]");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toMatch(/request_upload_link/);
    expect(decodeBase64("abcde").ok).toBe(false);
  });
});

describe("downloadFile", () => {
  it("refuses non-https, invalid and private addresses without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const u of ["http://example.com/a.png", "not a url", "https://localhost/a", "https://127.0.0.1/a", "https://169.254.169.254/latest", "https://[::1]/a", "https://db.internal/a", "https://printer.local/a", "https://x.localhost/a"]) {
      expect((await downloadFile(u)).ok, u).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads a public file without auto-following redirects", async () => {
    const fetchMock = vi.fn(async () => new Response(PNG, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadFile("https://files.example.com/a.png")).resolves.toEqual({ ok: true, bytes: PNG });
    expect((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].redirect).toBe("manual");
  });

  it("follows a safe redirect, but refuses one onto an internal address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: URL) =>
        u.hostname === "a.example.com" ? new Response(null, { status: 302, headers: { location: "https://b.example.com/f.png" } }) : new Response(PNG),
      ),
    );
    await expect(downloadFile("https://a.example.com/f")).resolves.toMatchObject({ ok: true });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })));
    await expect(downloadFile("https://a.example.com/f")).resolves.toEqual({ ok: false, error: "The file link redirects somewhere it can't be downloaded from." });
  });

  it("gives up after too many redirects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://loop.example.com/" } })));
    await expect(downloadFile("https://loop.example.com/")).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/redirects/) });
  });

  it("reports HTTP errors, network errors and files over 8 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    expect(await downloadFile("https://x.example.com/a")).toMatchObject({ ok: false, error: expect.stringMatching(/HTTP 403/) });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ETIMEDOUT"); }));
    expect(await downloadFile("https://x.example.com/a")).toMatchObject({ ok: false, error: expect.stringMatching(/ETIMEDOUT/) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { headers: { "content-length": String(MAX_FETCH_BYTES + 1) } })));
    expect(await downloadFile("https://x.example.com/a")).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 8\.0 MB/) });
  });
});

describe("tooBig / resolveBinaryInput", () => {
  it("tooBig speaks in MB", () => {
    expect(tooBig(3 * 1024 * 1024, 1024 * 1024).error).toMatch(/^The file is 3\.0 MB; the limit is 1\.0 MB/);
  });

  it("prefers ChatGPT's file, then source_url, then base64", async () => {
    const fetchMock = vi.fn(async () => new Response(JPG));
    vi.stubGlobal("fetch", fetchMock);
    await resolveBinaryInput({ file: { download_url: "https://files.oaiusercontent.com/f" }, source_url: "https://other.example.com/x", base64Content: "AAAA" });
    expect(String((fetchMock.mock.calls[0] as unknown as [URL])[0])).toBe("https://files.oaiusercontent.com/f");
    await resolveBinaryInput({ source_url: "  https://other.example.com/x  ", base64Content: "AAAA" });
    expect(String((fetchMock.mock.calls[1] as unknown as [URL])[0])).toBe("https://other.example.com/x");
    await expect(resolveBinaryInput({ base64Content: JPG.toString("base64") })).resolves.toEqual({ ok: true, bytes: JPG });
  });

  it("explains how to send a file when nothing usable was sent", async () => {
    await expect(resolveBinaryInput({ base64Content: "   " })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/No file was sent/) });
  });
});

describe("upload grants", () => {
  const kim = { name: "Kim", email: "kim@example.com", role: "edit" as const };

  it("round-trip for a current team member and expire after 30 minutes", () => {
    const { token, expiresAt } = signUploadGrant("abc123", "public/a.png", kim);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(readUploadGrant(token)).toMatchObject({ grant: { change: "abc123", path: "public/a.png" }, user: kim });
  });

  it("refuses forged, wrong-kind, expired and malformed grants", () => {
    expect(readUploadGrant("tgmcp_up.x.y")).toBeNull();
    expect(readUploadGrant(signBlob("at", { change: "a", path: "p", email: "kim@example.com" }))).toBeNull();
    expect(readUploadGrant(signBlob("upload", { change: "a", path: "p", email: "kim@example.com", exp: 1 }))).toBeNull();
    expect(readUploadGrant(signBlob("upload", { change: 1, path: "p", email: "kim@example.com" }))).toBeNull();
    expect(readUploadGrant(undefined)).toBeNull();
  });

  it("refuses someone removed from the team, or with read-only access", () => {
    const { token } = signUploadGrant("abc", "p.png", kim);
    expect(readUploadGrant(signUploadGrant("abc", "p.png", { name: "Reader", email: "read@example.com", role: "edit" }).token)).toBeNull();
    vi.stubEnv("MCP_ADMIN_USERS", "[]");
    expect(readUploadGrant(token)).toBeNull();
  });

  // Fixed 2026-10-16: a token-only user (no email) used to be rebuilt from the
  // grant itself and never looked up again.
  it("refuses a token-only user removed from MCP_ADMIN_USERS", () => {
    const { token } = signUploadGrant("abc", "p.png", { name: "Bot", email: "", role: "edit" });
    expect(readUploadGrant(token)).toMatchObject({ user: { name: "Bot", email: "", role: "edit" } });
    vi.stubEnv("MCP_ADMIN_USERS", "[]");
    expect(readUploadGrant(token)).toBeNull();
  });
});

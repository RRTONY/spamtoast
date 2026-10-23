// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcp/upload/route";
import { readUploadGrant, checkFileMatchesPath } from "@/lib/admin/binary-upload";
import { getChangeSet, isOpen, markEdited } from "@/lib/admin/change-sets";
import { buildMcpToolContext } from "@/lib/admin/mcp-tool-context";
import { putFileBase64 } from "@/lib/admin/github-client";
import { isPathDenied } from "@/lib/admin/guardrails";

// GitHub, the change store and the signed-link helper are all replaced.
vi.mock("@/lib/admin/binary-upload", () => ({
  MAX_UPLOAD_PAGE_BYTES: 4 * 1024 * 1024,
  readUploadGrant: vi.fn(),
  checkFileMatchesPath: vi.fn(),
  tooBig: vi.fn(() => ({ error: "Over the limit." })),
}));
vi.mock("@/lib/admin/change-sets", () => ({ getChangeSet: vi.fn(), isOpen: vi.fn(), markEdited: vi.fn() }));
vi.mock("@/lib/admin/mcp-tool-context", () => ({ buildMcpToolContext: vi.fn() }));
vi.mock("@/lib/admin/github-client", () => ({ putFileBase64: vi.fn() }));
vi.mock("@/lib/admin/guardrails", () => ({ isPathDenied: vi.fn(() => false) }));

const GRANT = { user: { name: "Darryl", email: "d@example.com", role: "edit" }, grant: { change: "chg1", path: "public/logo.png" } };
const CHANGE = { key: "chg1", title: "New <logo>", status: "open" };
const finalize = vi.fn();
const ensureWriteBranch = vi.fn();

beforeEach(() => {
  vi.mocked(readUploadGrant).mockReturnValue(GRANT as never);
  vi.mocked(getChangeSet).mockResolvedValue(CHANGE as never);
  vi.mocked(isOpen).mockReturnValue(true);
  vi.mocked(isPathDenied).mockReturnValue(false);
  vi.mocked(checkFileMatchesPath).mockReturnValue(null as never);
  ensureWriteBranch.mockResolvedValue("admin/mcp-chg1");
  vi.mocked(buildMcpToolContext).mockResolvedValue({ ctx: { ensureWriteBranch }, finalize } as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function upload(file?: File, t = "tok") {
  const fd = new FormData();
  fd.set("t", t);
  if (file) fd.set("file", file);
  return POST(new Request("https://spamtoast.com/api/mcp/upload", { method: "POST", body: fd }));
}
const png = () => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "logo.png", { type: "image/png" });

describe("GET /api/mcp/upload", () => {
  it("shows 'expired' (401) for a bad or old link", async () => {
    vi.mocked(readUploadGrant).mockReturnValue(null as never);
    const res = await GET(new Request("https://spamtoast.com/api/mcp/upload?t=bad"));
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("This link has expired");
  });

  it("shows 'closed' (409) when the change was published or discarded", async () => {
    vi.mocked(isOpen).mockReturnValue(false);
    expect((await GET(new Request("https://spamtoast.com/api/mcp/upload?t=tok"))).status).toBe(409);
  });

  it("shows the upload form, escaping the change title, never indexed or cached", async () => {
    const res = await GET(new Request("https://spamtoast.com/api/mcp/upload?t=tok"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("New &lt;logo&gt;");
    expect(html).not.toContain("New <logo>");
    expect(html).toContain('accept=".png"');
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/mcp/upload", () => {
  it("refuses a declared body over the limit with 413 before reading it", async () => {
    const res = await POST(
      new Request("https://spamtoast.com/api/mcp/upload", { method: "POST", headers: { "content-length": String(10 * 1024 * 1024) }, body: "x" }),
    );
    expect(res.status).toBe(413);
  });

  it("refuses an expired link or a protected path", async () => {
    vi.mocked(readUploadGrant).mockReturnValue(null as never);
    expect((await upload(png())).status).toBe(401);
    vi.mocked(readUploadGrant).mockReturnValue(GRANT as never);
    vi.mocked(isPathDenied).mockReturnValue(true);
    expect((await upload(png())).status).toBe(401);
    expect(putFileBase64).not.toHaveBeenCalled();
  });

  it("asks for a file when none was chosen, and rejects a file that doesn't match the path", async () => {
    expect((await upload()).status).toBe(400);
    vi.mocked(checkFileMatchesPath).mockReturnValue("That isn't a PNG." as never);
    const res = await upload(png());
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("That isn&#39;t a PNG.");
    expect(putFileBase64).not.toHaveBeenCalled();
  });

  it("saves the file to that change's branch", async () => {
    const res = await upload(png());
    expect(res.status).toBe(200);
    expect(markEdited).toHaveBeenCalledWith(CHANGE);
    expect(putFileBase64).toHaveBeenCalledWith(
      "public/logo.png",
      Buffer.from([137, 80, 78, 71, 1, 2, 3]).toString("base64"),
      "Upload public/logo.png [by Darryl]",
      "admin/mcp-chg1",
    );
    expect(finalize).toHaveBeenCalled();
  });

  it("says it failed (500) when GitHub refuses", async () => {
    vi.mocked(putFileBase64).mockRejectedValue(new Error("github down"));
    const res = await upload(png());
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("couldn't be saved");
  });
});

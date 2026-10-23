import { findMcpUserByEmail, parseMcpUsers, type McpUser } from "@/lib/admin/mcp-auth";
import { signBlob, verifyBlob } from "@/lib/admin/mcp-oauth";

// Getting a picture or PDF the person attached in ChatGPT/Claude into the
// repo. The AI itself never holds the file's bytes (it only "sees" the
// image), so asking it for base64 fails: that is exactly what broke on
// 2026-10-08 ("content is not valid Base64"). Three ways in, best first:
//  1. ChatGPT: the tool declares `file` in _meta["openai/fileParams"], so
//     ChatGPT passes { download_url, file_id } and the server downloads it.
//  2. Any app: request_upload_link gives the person a short-lived page to
//     drop the file on (Claude.ai has no file hand-off to MCP servers).
//  3. A public https link to the file, or real base64 for small files.

export const MAX_FETCH_BYTES = 8 * 1024 * 1024;
// Netlify rejects request bodies over ~6 MB before our code runs.
export const MAX_UPLOAD_PAGE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_LINK_TTL_S = 30 * 60;

export const OPENAI_FILE_SCHEMA = {
  type: "object",
  description:
    "ChatGPT only: the file the person attached. ChatGPT fills this in itself; don't invent it.",
  properties: {
    download_url: { type: "string" },
    file_id: { type: "string" },
    mime_type: { type: "string" },
    file_name: { type: "string" },
  },
  required: ["download_url", "file_id"],
  additionalProperties: false,
} as const;

type Result = { ok: true; bytes: Buffer } | { ok: false; error: string };

const UPLOAD_LINK_HINT =
  "Use request_upload_link instead: it gives the person a private link to drop the file on, and it goes straight into this change.";

// First bytes of each format we expect, so a login page or error page
// saved as "hero.png" is refused instead of committed.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  png: (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  webp: (b) =>
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP",
  avif: (b) => b.subarray(4, 12).toString("latin1").startsWith("ftypavi"),
  pdf: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  ico: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
  svg: (b) => /<svg[\s>]/i.test(b.subarray(0, 2048).toString("utf8")),
};
SIGNATURES.jpeg = SIGNATURES.jpg;

function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "";
}

export function checkFileMatchesPath(
  path: string,
  bytes: Buffer,
): string | null {
  if (bytes.length === 0) return "The file is empty.";
  const ext = extensionOf(path);
  const matches = SIGNATURES[ext];
  if (matches && !matches(bytes)) {
    return `The file isn't a real .${ext} (its contents look like something else). Use the matching file name ending, or check the right file was sent.`;
  }
  return null;
}

export function decodeBase64(value: string): Result {
  const cleaned = value
    .replace(/^data:[^;,]*;base64,/i, "")
    .replace(/\s+/g, "");
  if (!cleaned) return { ok: false, error: "base64Content is empty." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    return {
      ok: false,
      error: `base64Content isn't real base64. If the person attached the file in the chat, you only see the picture, not its bytes, so don't try to write it out. ${UPLOAD_LINK_HINT}`,
    };
  }
  return { ok: true, bytes: Buffer.from(cleaned, "base64") };
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^[\d.]+$/.test(h) ||
    h.includes(":")
  );
}

export async function downloadFile(url: string): Promise<Result> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "That file link isn't a valid web address." };
  }
  if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) {
    return {
      ok: false,
      error: "Only public https links can be downloaded.",
    };
  }
  let res: Response;
  try {
    // Follow redirects by hand so a public link can't bounce the server
    // onto an internal address.
    for (let hops = 0; ; hops++) {
      res = await fetch(parsed, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const next = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !next) break;
      parsed = new URL(next, parsed);
      if (
        hops >= 3 ||
        parsed.protocol !== "https:" ||
        isPrivateHost(parsed.hostname)
      ) {
        return {
          ok: false,
          error:
            "The file link redirects somewhere it can't be downloaded from.",
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't download the file (${err instanceof Error ? err.message : "network error"}). ${UPLOAD_LINK_HINT}`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `Downloading the file failed (HTTP ${res.status}). The link may have expired. ${UPLOAD_LINK_HINT}`,
    };
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_FETCH_BYTES) return tooBig(declared, MAX_FETCH_BYTES);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_FETCH_BYTES)
    return tooBig(bytes.length, MAX_FETCH_BYTES);
  return { ok: true, bytes };
}

export function tooBig(
  size: number,
  limit: number,
): { ok: false; error: string } {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return {
    ok: false,
    error: `The file is ${mb(size)} MB; the limit is ${mb(limit)} MB. Ask the person for a smaller version (a website image rarely needs more than 1 MB).`,
  };
}

// Turns whichever of file / source_url / base64Content the caller sent
// into the file's bytes.
export async function resolveBinaryInput(
  input: Record<string, unknown>,
): Promise<Result> {
  const file = input.file as { download_url?: unknown } | undefined;
  if (
    file &&
    typeof file === "object" &&
    typeof file.download_url === "string"
  ) {
    return downloadFile(file.download_url);
  }
  if (typeof input.source_url === "string" && input.source_url.trim()) {
    return downloadFile(input.source_url.trim());
  }
  if (typeof input.base64Content === "string" && input.base64Content.trim()) {
    const decoded = decodeBase64(input.base64Content);
    if (decoded.ok && decoded.bytes.length > MAX_FETCH_BYTES) {
      return tooBig(decoded.bytes.length, MAX_FETCH_BYTES);
    }
    return decoded;
  }
  return {
    ok: false,
    error: `No file was sent. In ChatGPT, pass the attached file as \`file\`. ${UPLOAD_LINK_HINT}`,
  };
}

export interface UploadGrant {
  change: string;
  path: string;
  name: string;
  email: string;
  role: McpUser["role"];
  exp: number;
}

export function signUploadGrant(
  change: string,
  path: string,
  user: McpUser,
): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + UPLOAD_LINK_TTL_S;
  const token = signBlob("upload", {
    change,
    path,
    name: user.name,
    email: user.email ?? "",
    role: user.role,
    exp,
  });
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

// A token-only person (no email) is matched by name against the current list,
// and their role is taken from the list, not from the old grant.
function findTokenOnlyUser(name: unknown): McpUser | null {
  if (typeof name !== "string" || !name) return null;
  const entry = parseMcpUsers(process.env.MCP_ADMIN_USERS).find(
    (u) => !u.email && u.token && u.name === name,
  );
  return entry ? { name: entry.name, email: "", role: entry.role } : null;
}

// Re-checks the person on use, so someone removed from MCP_ADMIN_USERS
// can't use a link they were given before.
export function readUploadGrant(
  token: unknown,
): { grant: UploadGrant; user: McpUser } | null {
  const grant = verifyBlob<UploadGrant & Record<string, unknown>>(
    "upload",
    token,
  );
  if (
    !grant ||
    typeof grant.change !== "string" ||
    typeof grant.path !== "string"
  ) {
    return null;
  }
  const user = grant.email
    ? findMcpUserByEmail(grant.email)
    : findTokenOnlyUser(grant.name);
  if (!user || user.role === "read") return null;
  return { grant, user };
}

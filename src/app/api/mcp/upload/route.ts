import {
  checkFileMatchesPath,
  MAX_UPLOAD_PAGE_BYTES,
  readUploadGrant,
  tooBig,
} from "@/lib/admin/binary-upload";
import { getChangeSet, isOpen, markEdited } from "@/lib/admin/change-sets";
import { buildMcpToolContext } from "@/lib/admin/mcp-tool-context";
import * as gh from "@/lib/admin/github-client";
import { isPathDenied } from "@/lib/admin/guardrails";

export const dynamic = "force-dynamic";

// The page behind request_upload_link: the person drops the file they
// attached in the chat, and it is saved into that one change. The signed
// link is the only key (one change, one path, 30 minutes, re-checked
// against MCP_ADMIN_USERS on use). See binary-upload.ts for why this exists.

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} | SpamToast</title><style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:oklch(0.16 0.02 255);color:oklch(0.96 0.01 80);font:16px/1.5 system-ui,-apple-system,sans-serif;padding:16px;box-sizing:border-box}
main{width:100%;max-width:440px;background:oklch(0.22 0.02 255);border:1px solid oklch(1 0 0/0.1);border-radius:16px;padding:28px}
h1{font-size:22px;margin:0 0 8px}
p{margin:0 0 14px;color:oklch(0.85 0.01 80)}
code{font-size:14px;word-break:break-all;color:oklch(0.82 0.12 80)}
input[type=file]{display:block;width:100%;margin:8px 0 18px;padding:12px;border:1px dashed oklch(1 0 0/0.3);border-radius:10px;box-sizing:border-box;color:inherit}
button{width:100%;min-height:48px;border:0;border-radius:10px;background:oklch(0.75 0.13 80);color:oklch(0.18 0.02 60);font-weight:600;font-size:16px;cursor:pointer}
button:disabled{opacity:.6}
</style></head><body><main>${body}</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );
}

const expired = () =>
  page(
    401,
    "Link expired",
    "<h1>This link has expired</h1><p>Upload links work for 30 minutes. Go back to the chat and ask for a new one.</p>",
  );

async function loadOpenChange(key: string) {
  const change = await getChangeSet(key);
  if (!change || !isOpen(change) || change.status === "awaiting_confirmation") {
    return null;
  }
  return change;
}

const closed = () =>
  page(
    409,
    "Change closed",
    "<h1>This change isn't open any more</h1><p>It was published, discarded or isn't confirmed yet. Go back to the chat and ask for a new link.</p>",
  );

export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const access = readUploadGrant(token);
  if (!access) return expired();
  const change = await loadOpenChange(access.grant.change);
  if (!change) return closed();
  const ext = access.grant.path.split(".").pop() ?? "";
  const maxMb = MAX_UPLOAD_PAGE_BYTES / 1024 / 1024;
  return page(
    200,
    "Upload a file",
    `<h1>Upload a file</h1>
<p>For the change <strong>${escape(change.title)}</strong>.</p>
<p>It will be saved as <code>${escape(access.grant.path)}</code>. Nothing goes live until the change is reviewed and published.</p>
<form method="post" enctype="multipart/form-data" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Uploading…'">
<input type="hidden" name="t" value="${escape(token)}">
<label for="f">Choose the ${escape(ext.toUpperCase())} file (up to ${maxMb} MB)</label>
<input id="f" type="file" name="file" accept=".${escape(ext)}" required>
<button type="submit">Upload</button>
</form>`,
  );
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_PAGE_BYTES + 64 * 1024) {
    return page(
      413,
      "Too big",
      `<h1>That file is too big</h1><p>${escape(tooBig(declared, MAX_UPLOAD_PAGE_BYTES).error)}</p>`,
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return page(
      400,
      "Upload failed",
      "<h1>Upload failed</h1><p>The file didn't arrive. Go back and try again.</p>",
    );
  }
  const access = readUploadGrant(form.get("t"));
  if (!access || isPathDenied(access.grant.path)) return expired();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return page(
      400,
      "No file",
      "<h1>No file chosen</h1><p>Go back and pick the file first.</p>",
    );
  }
  if (file.size > MAX_UPLOAD_PAGE_BYTES) {
    return page(
      413,
      "Too big",
      `<h1>That file is too big</h1><p>${escape(tooBig(file.size, MAX_UPLOAD_PAGE_BYTES).error)}</p>`,
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const problem = checkFileMatchesPath(access.grant.path, bytes);
  if (problem) {
    return page(
      400,
      "Wrong file",
      `<h1>That didn't work</h1><p>${escape(problem)}</p><p>Go back and try another file.</p>`,
    );
  }
  const change = await loadOpenChange(access.grant.change);
  if (!change) return closed();

  const { user, grant } = access;
  console.log(
    `[mcp] ${user.name} (${user.role}) uploaded ${grant.path} to change ${change.key}`,
  );
  await markEdited(change);
  const { ctx, finalize } = await buildMcpToolContext(change);
  try {
    const branch = await ctx.ensureWriteBranch();
    await gh.putFileBase64(
      grant.path,
      bytes.toString("base64"),
      `Upload ${grant.path} [by ${user.name}]`,
      branch,
    );
    await finalize();
  } catch (err) {
    console.error(`[mcp] upload of ${grant.path} failed`, err);
    return page(
      500,
      "Upload failed",
      "<h1>That didn't work</h1><p>The file couldn't be saved. Try again in a minute, or tell the AI in the chat.</p>",
    );
  }
  return page(
    200,
    "Uploaded",
    `<h1>Done, the file is uploaded</h1><p>Saved as <code>${escape(grant.path)}</code> in the change <strong>${escape(change.title)}</strong>.</p><p>Go back to the chat and say it's done. You can close this page.</p>`,
  );
}

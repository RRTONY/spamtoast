// Thin fetch-based wrapper around GitHub's REST API (plain fetch, no
// @octokit/rest: a new dependency needs a separate conversation).
//
// Owner/repo come from the server's GITHUB_REPO env var ("owner/name",
// default RRTONY/spamtoast), never from a tool parameter, so a
// prompt-injected instruction can't redirect a write to another repository.
import { gunzipSync } from "node:zlib";
import { netlifySiteName } from "@/lib/admin/site-config";

export const DEFAULT_GITHUB_REPO = "RRTONY/spamtoast";

function repoFromEnv(): [string, string] {
  const raw = (process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO).trim();
  const m = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? [m[1], m[2]] : (DEFAULT_GITHUB_REPO.split("/") as [string, string]);
}

const [OWNER, REPO] = repoFromEnv();
const API = "https://api.github.com";

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_TOKEN is not set");
  return t;
}

class GitHubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(
      res.status,
      `GitHub ${init.method || "GET"} ${path} -> ${res.status}: ${body}`,
    );
  }
  if (res.status === 204) return null;
  return (await res.json()) as T;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof GitHubApiError && err.status === 404;
}

export function errorStatus(err: unknown): number | null {
  return err instanceof GitHubApiError ? err.status : null;
}

export interface FileContent {
  content: string;
  sha: string;
}

export async function getFile(
  path: string,
  ref: string,
): Promise<FileContent | null> {
  try {
    const data = await gh<{ content: string; sha: string; type: string }>(
      `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data || data.type !== "file") return null;
    return {
      content: Buffer.from(data.content, "base64").toString("utf-8"),
      sha: data.sha,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export interface DirEntry {
  path: string;
  type: "file" | "dir";
  size: number;
}

export async function listDir(path: string, ref: string): Promise<DirEntry[]> {
  // An empty path is the repo root: GitHub wants `/contents` with no trailing
  // segment, not `/contents/`.
  const segment = path ? `/${encodeURI(path)}` : "";
  const data = await gh<
    | Array<{ path: string; type: string; size: number }>
    | { path: string; type: string; size: number }
  >(
    `/repos/${OWNER}/${REPO}/contents${segment}?ref=${encodeURIComponent(ref)}`,
  );
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  return arr.map((e) => ({
    path: e.path,
    type: e.type === "dir" ? "dir" : "file",
    size: e.size,
  }));
}

// Every file path in the repo at `ref`, in one request (git tree API), so a
// connected AI can find a file by name instead of opening folders one by one.
export async function listAllFiles(ref: string): Promise<string[]> {
  const data = await gh<{ tree: Array<{ path: string; type: string }> }>(
    `/repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  return (data?.tree ?? []).filter((e) => e.type === "blob").map((e) => e.path);
}

export interface RepoTextFile {
  path: string;
  content: string;
}

const MAX_SEARCH_FILE_BYTES = 512 * 1024;

// Pulls the text files out of a .tar (GitHub's tarball). Plain ustar plus
// the pax records GitHub writes; binary and very large files are skipped.
export function readTarTextFiles(tar: Buffer): RepoTextFile[] {
  const files: RepoTextFile[] = [];
  let paxPath: string | null = null;
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (from: number, len: number) =>
      header.subarray(from, from + len).toString("utf8").replace(/\0[\s\S]*$/, ""); // [\s\S], not the "s" flag: tsconfig targets ES2017
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1] ?? null;
      continue;
    }
    const fullName = paxPath ?? name;
    paxPath = null;
    if (type !== "0" && type !== "") continue;
    if (size > MAX_SEARCH_FILE_BYTES || body.subarray(0, 8000).includes(0)) continue;
    // GitHub wraps everything in one "<owner>-<repo>-<sha>/" folder.
    const path = fullName.replace(/^[^/]+\//, "");
    if (path) files.push({ path, content: body.toString("utf8") });
  }
  return files;
}

// Every text file in the repo at `ref`, from one tarball download (about
// 3 MB). GitHub's code search doesn't index this private repo and only
// covers the default branch, so searching the archive is the reliable way
// to look inside files, including on a change's own branch.
export async function getRepoTextFiles(ref: string): Promise<RepoTextFile[]> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/tarball/${encodeURIComponent(ref)}`,
    {
      headers: {
        Authorization: `Bearer ${token()}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new GitHubApiError(res.status, `GitHub tarball ${ref} -> ${res.status}`);
  }
  return readTarTextFiles(gunzipSync(Buffer.from(await res.arrayBuffer())));
}

let cachedDefaultBranch: string | null = null;

// Don't assume "main" — resolve and cache the repo's actual default branch.
export async function getDefaultBranch(): Promise<string> {
  if (cachedDefaultBranch) return cachedDefaultBranch;
  const repo = await gh<{ default_branch: string }>(`/repos/${OWNER}/${REPO}`);
  cachedDefaultBranch = repo?.default_branch || "main";
  return cachedDefaultBranch;
}

export async function getDefaultBranchSha(): Promise<string> {
  const base = await getDefaultBranch();
  const ref = await gh<{ object: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/git/ref/heads/${base}`,
  );
  if (!ref) throw new Error(`Could not resolve ${base} branch HEAD`);
  return ref.object.sha;
}

export async function branchExists(branch: string): Promise<boolean> {
  try {
    await gh(
      `/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

export async function createBranch(branch: string): Promise<void> {
  const sha = await getDefaultBranchSha();
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

export async function putFile(
  path: string,
  content: string,
  message: string,
  branch: string,
): Promise<void> {
  const existing = await getFile(path, branch);
  await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
}

// Like putFile, but takes content that's already base64-encoded (images,
// PDFs, etc.) and passes it straight through — putFile's utf-8 round-trip
// would corrupt binary data.
export async function putFileBase64(
  path: string,
  base64Content: string,
  message: string,
  branch: string,
): Promise<void> {
  const existing = await getFile(path, branch);
  await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: base64Content,
      branch,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
}

export async function deleteFile(
  path: string,
  message: string,
  branch: string,
): Promise<void> {
  const existing = await getFile(path, branch);
  if (!existing)
    throw new Error(`${path} does not exist on ${branch}, nothing to delete`);
  await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha: existing.sha, branch }),
  });
}

export interface OpenPR {
  number: number;
  branch: string;
  url: string;
}

export async function findOpenAdminPR(
  branchPrefix: string,
): Promise<OpenPR | null> {
  const base = await getDefaultBranch();
  const prs = await gh<
    Array<{ number: number; html_url: string; head: { ref: string } }>
  >(`/repos/${OWNER}/${REPO}/pulls?state=open&base=${base}`);
  const match = (prs || []).find((pr) => pr.head.ref.startsWith(branchPrefix));
  return match
    ? { number: match.number, branch: match.head.ref, url: match.html_url }
    : null;
}

export async function listOpenAdminPRs(
  branchPrefix: string,
): Promise<OpenPR[]> {
  const base = await getDefaultBranch();
  const prs = await gh<
    Array<{ number: number; html_url: string; head: { ref: string } }>
  >(`/repos/${OWNER}/${REPO}/pulls?state=open&base=${base}&per_page=100`);
  return (prs || [])
    .filter((pr) => pr.head.ref.startsWith(branchPrefix))
    .map((pr) => ({
      number: pr.number,
      branch: pr.head.ref,
      url: pr.html_url,
    }));
}

export async function getPRHeadSha(prNumber: number): Promise<string | null> {
  const pr = await gh<{ head: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/pulls/${prNumber}`,
  );
  return pr?.head.sha ?? null;
}

export async function getPRState(prNumber: number): Promise<{
  open: boolean;
  merged: boolean;
  mergeSha: string | null;
}> {
  const pr = await gh<{
    state: string;
    merged: boolean;
    merge_commit_sha: string | null;
  }>(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`);
  return {
    open: pr?.state === "open",
    merged: !!pr?.merged,
    mergeSha: pr?.merged ? (pr.merge_commit_sha ?? null) : null,
  };
}

export async function listBranches(prefix: string): Promise<string[]> {
  const refs = await gh<Array<{ ref: string }>>(
    `/repos/${OWNER}/${REPO}/git/matching-refs/heads/${prefix}`,
  );
  return (refs || []).map((r) => r.ref.replace(/^refs\/heads\//, ""));
}

export async function closePR(prNumber: number): Promise<void> {
  await gh(`/repos/${OWNER}/${REPO}/pulls/${prNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

export interface CommitFile {
  path: string;
  status: string;
  previousPath: string | null;
}

export async function getCommitFiles(
  sha: string,
): Promise<{ parentSha: string; files: CommitFile[] }> {
  const commit = await gh<{
    parents: Array<{ sha: string }>;
    files?: Array<{
      filename: string;
      status: string;
      previous_filename?: string;
    }>;
  }>(`/repos/${OWNER}/${REPO}/commits/${encodeURIComponent(sha)}`);
  if (!commit || commit.parents.length === 0) {
    throw new Error(`Commit ${sha} has no parent to restore from`);
  }
  return {
    parentSha: commit.parents[0].sha,
    files: (commit.files || []).map((f) => ({
      path: f.filename,
      status: f.status,
      previousPath: f.previous_filename ?? null,
    })),
  };
}

// The git blob id of a file at a ref (null if it doesn't exist there).
// Cheap way to tell whether a file is identical in two versions without
// downloading it, and to restore a file (images too) by pointing at its old
// blob instead of re-uploading its content.
export async function getFileSha(
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const data = await gh<{ sha: string; type: string } | unknown[]>(
      `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data || Array.isArray(data)) return null;
    const file = data as { sha: string; type: string };
    return file.type === "file" ? file.sha : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// Creates `branch` off the default branch with one commit that sets each
// listed file to the given blob (sha) or removes it (sha null). Used by
// "undo a published change": every file goes back to its old version in a
// single commit, binary files included, with nothing downloaded.
export async function createBranchWithFileStates(
  branch: string,
  files: Array<{ path: string; sha: string | null }>,
  message: string,
): Promise<void> {
  const headSha = await getDefaultBranchSha();
  const head = await gh<{ tree: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/git/commits/${headSha}`,
  );
  if (!head) throw new Error("Could not read the live site's latest version");
  const tree = await gh<{ sha: string }>(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: head.tree.sha,
      tree: files.map((f) => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: f.sha,
      })),
    }),
  });
  if (!tree) throw new Error("Could not build the undo version");
  const commit = await gh<{ sha: string }>(
    `/repos/${OWNER}/${REPO}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
    },
  );
  if (!commit) throw new Error("Could not save the undo version");
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  });
}

export async function openPR(
  branch: string,
  title: string,
  body: string,
): Promise<OpenPR> {
  const base = await getDefaultBranch();
  const pr = await gh<{ number: number; html_url: string }>(
    `/repos/${OWNER}/${REPO}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ title, head: branch, base, body }),
    },
  );
  if (!pr) throw new Error("PR creation returned no data");
  return { number: pr.number, branch, url: pr.html_url };
}

export interface CompareResult {
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  aheadBy: number;
}

export async function compareToDefaultBranch(
  branch: string,
): Promise<CompareResult> {
  const base = await getDefaultBranch();
  const data = await gh<{
    ahead_by: number;
    files?: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
  }>(`/repos/${OWNER}/${REPO}/compare/${base}...${encodeURIComponent(branch)}`);
  return {
    aheadBy: data?.ahead_by ?? 0,
    files: (data?.files || []).map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

export type PRCheckState = "success" | "pending" | "failure" | "unknown";

// GitHub has two separate systems for this: the legacy Status API (what
// Netlify's deploy-preview posts) and the newer Checks API (what GitHub
// Actions workflows post as check-runs). A PR can have either, both, or
// neither, so both must be queried and combined — checking only /status
// would silently ignore a GitHub Actions lint job's pass/fail forever.
export async function getPRCombinedStatus(
  prNumber: number,
): Promise<PRCheckState> {
  const pr = await gh<{ head: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/pulls/${prNumber}`,
  );
  if (!pr) return "unknown";
  try {
    const [status, checkRuns] = await Promise.all([
      gh<{ state: string }>(
        `/repos/${OWNER}/${REPO}/commits/${pr.head.sha}/status`,
      ),
      gh<{ check_runs: Array<{ status: string; conclusion: string | null }> }>(
        `/repos/${OWNER}/${REPO}/commits/${pr.head.sha}/check-runs`,
      ),
    ]);

    const states: PRCheckState[] = [];
    if (
      status?.state === "success" ||
      status?.state === "failure" ||
      status?.state === "pending"
    ) {
      states.push(status.state);
    }
    for (const run of checkRuns?.check_runs || []) {
      if (run.status !== "completed") {
        states.push("pending");
      } else if (
        run.conclusion === "success" ||
        run.conclusion === "neutral" ||
        run.conclusion === "skipped"
      ) {
        states.push("success");
      } else {
        states.push("failure");
      }
    }

    if (states.length === 0) return "unknown";
    if (states.includes("failure")) return "failure";
    if (states.includes("pending")) return "pending";
    return "success";
  } catch {
    return "unknown";
  }
}

export interface FailingCheck {
  id: number;
  name: string;
  url: string | null;
}

export interface PRChecksDetail {
  status: PRCheckState;
  previewUrl: string | null;
  failingChecks: FailingCheck[];
  // The same checks split the way the review shows them: Netlify's preview
  // build (its deploy status plus its own "... - <netlify site>" check runs) vs
  // GitHub Actions jobs (tests, lint and format of changed files).
  build?: PRCheckState;
  ci?: PRCheckState;
  ciWaiting?: string[];
  ciFailing?: string[];
}

// Netlify's deploy status context and its own check runs ("Redirect rules -
// <site>", "Header rules - <site>", ...).
function isNetlifyRun(name: string): boolean {
  return name.endsWith(` - ${netlifySiteName()}`);
}

function combine(states: PRCheckState[]): PRCheckState {
  if (!states.length) return "unknown";
  if (states.includes("failure")) return "failure";
  if (states.includes("pending")) return "pending";
  return "success";
}

// Richer version of getPRCombinedStatus for the UI: also surfaces the
// Netlify deploy-preview URL (scraped from Netlify's own bot comment — GitHub
// doesn't expose it as structured data, only the dashboard's internal deploy
// page URL) and which specific checks are failing, so the admin (or the next
// chat message) has something concrete to act on instead of just "failing."
export async function getPRChecksDetail(
  prNumber: number,
): Promise<PRChecksDetail> {
  const pr = await gh<{ head: { sha: string } }>(
    `/repos/${OWNER}/${REPO}/pulls/${prNumber}`,
  );
  if (!pr) return { status: "unknown", previewUrl: null, failingChecks: [] };

  const [statusResult, checkRunsResult, comments] = await Promise.all([
    gh<{ state: string; statuses?: Array<{ context: string; state: string }> }>(
      `/repos/${OWNER}/${REPO}/commits/${pr.head.sha}/status`,
    ).catch(() => null),
    gh<{
      check_runs: Array<{
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        html_url: string;
      }>;
    }>(`/repos/${OWNER}/${REPO}/commits/${pr.head.sha}/check-runs`).catch(
      () => null,
    ),
    gh<Array<{ body: string }>>(
      `/repos/${OWNER}/${REPO}/issues/${prNumber}/comments`,
    ).catch(() => null),
  ]);

  const states: PRCheckState[] = [];
  const failingChecks: FailingCheck[] = [];
  const buildStates: PRCheckState[] = [];
  const ciStates: PRCheckState[] = [];
  const ciWaiting: string[] = [];
  const ciFailing: string[] = [];
  for (const st of statusResult?.statuses ?? []) {
    const state: PRCheckState =
      st.state === "success"
        ? "success"
        : st.state === "pending"
          ? "pending"
          : "failure";
    (st.context.startsWith("netlify/") ? buildStates : ciStates).push(state);
  }

  if (
    statusResult?.state === "success" ||
    statusResult?.state === "failure" ||
    statusResult?.state === "pending"
  ) {
    states.push(statusResult.state);
  }
  for (const run of checkRunsResult?.check_runs || []) {
    const isNetlify = isNetlifyRun(run.name);
    let state: PRCheckState;
    if (run.status !== "completed") {
      state = "pending";
      if (!isNetlify) ciWaiting.push(run.name);
    } else if (
      run.conclusion === "success" ||
      run.conclusion === "neutral" ||
      run.conclusion === "skipped"
    ) {
      state = "success";
    } else {
      state = "failure";
      failingChecks.push({ id: run.id, name: run.name, url: run.html_url });
      if (!isNetlify) ciFailing.push(run.name);
    }
    states.push(state);
    (isNetlify ? buildStates : ciStates).push(state);
  }

  let previewUrl: string | null = null;
  for (const comment of comments || []) {
    const match = comment.body.match(
      /https:\/\/deploy-preview-\d+--[\w-]+\.netlify\.app/,
    );
    if (match) {
      previewUrl = match[0];
      break;
    }
  }

  let status: PRCheckState = "unknown";
  if (states.length > 0) {
    if (states.includes("failure")) status = "failure";
    else if (states.includes("pending")) status = "pending";
    else status = "success";
  }

  return {
    status,
    previewUrl,
    failingChecks,
    build: combine(buildStates),
    ci: combine(ciStates),
    ciWaiting,
    ciFailing,
  };
}

// GitHub Actions job logs run to hundreds of KB, but the actual failing
// command's error is almost always in the last screenful of output — keep
// only the tail, and cap it well under a size that's still readable in a
// tool result instead of flooding the model's context.
const LOG_TAIL_LINES = 200;
const LOG_TAIL_MAX_CHARS = 8000;

export function truncateLogTail(text: string): string {
  const tail = text.split("\n").slice(-LOG_TAIL_LINES).join("\n");
  return tail.length > LOG_TAIL_MAX_CHARS
    ? tail.slice(-LOG_TAIL_MAX_CHARS)
    : tail;
}

// Raw log text for one failed GitHub Actions check run — a check run's `id`
// doubles as its Actions job id, so this is the same id getPRChecksDetail's
// failingChecks already return. Unlike every other call in this file, the
// response here is plain text (GitHub redirects to a signed log URL), not
// JSON, so it can't go through the gh() helper above.
export async function getFailingCheckLogExcerpt(
  checkRunId: number,
): Promise<string> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/actions/jobs/${checkRunId}/logs`,
    {
      headers: {
        Authorization: `Bearer ${token()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new GitHubApiError(
      res.status,
      `Failed to fetch log for check run ${checkRunId} (${res.status})`,
    );
  }
  return truncateLogTail(await res.text());
}

// expectedHeadSha makes GitHub refuse the merge if anything was added to
// the change after it was reviewed.
export async function mergePR(
  prNumber: number,
  expectedHeadSha?: string,
): Promise<{ merged: boolean; sha: string }> {
  const result = await gh<{ merged: boolean; sha: string }>(
    `/repos/${OWNER}/${REPO}/pulls/${prNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        merge_method: "squash",
        ...(expectedHeadSha ? { sha: expectedHeadSha } : {}),
      }),
    },
  );
  if (!result) throw new Error("Merge returned no data");
  return result;
}

export async function deleteBranch(branch: string): Promise<void> {
  await gh(
    `/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: "DELETE" },
  );
}

export const GITHUB_REPO = { owner: OWNER, repo: REPO };

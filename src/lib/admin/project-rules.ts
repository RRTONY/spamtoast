import { createHash } from "crypto";
import * as gh from "@/lib/admin/github-client";

// AGENTS.md is the entry point every AI tool reads first (a must-follow
// summary, plus the Next.js 16 block `next dev` maintains between its
// markers); CONTRIBUTING.md holds the full rules. Both are served, AGENTS.md
// first, and the rules version covers both, so editing either one makes
// connected sessions re-read.
export const RULES_PATH = "AGENTS.md";
export const FULL_RULES_PATH = "CONTRIBUTING.md";
export const KNOWLEDGE_BASE_DIR = "docs/ai";
// Returned alongside the rules so a connecting client gets the "what kind of
// request is this, and where does it live" answers in the same first call,
// instead of exploring the repo file by file.
export const GUIDE_PATHS = {
  taskGuide: "docs/ai/TASK_GUIDE.md",
  projectStructure: "docs/ai/PROJECT_STRUCTURE.md",
  // The main project file. Only its "Current status" block is returned (see
  // statusBlock below), so it stays small as the file grows.
  projectStatus: "SPAMTOAST-TODO.md",
} as const;

// From the "## Current status" heading up to the next "---" rule. If that
// heading is missing (renamed, or an older copy of the file), the top of the
// file instead, so the answer is "roughly right" rather than 200 KB or nothing.
function statusBlock(markdown: string): string {
  const start = markdown.indexOf("## Current status");
  if (start === -1) return markdown.slice(0, 8000);
  const end = markdown.indexOf("\n---", start);
  return markdown.slice(start, end === -1 ? undefined : end).trim();
}

// Tools that change the site or a change record. A connected Claude/ChatGPT
// session can ignore server instructions, so these refuse to run until the
// caller proves it loaded the current rules by echoing back the rulesVersion
// from get_project_rules. Stateless by design (no session memory on
// Netlify): the proof travels with each call instead.
export const RULES_GATED_TOOLS = new Set([
  "github_write_file",
  "github_edit_file",
  "github_write_binary_file",
  "request_upload_link",
  "github_delete_file",
  "add_to_wall_of_shame",
  "start_change",
  "confirm_change",
  "submit_for_review",
  "publish_changes",
  "discard_change",
  "undo_change",
]);

export const RULES_VERSION_PARAM = "rules_version";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { version: string; content: string; fullRules: string; at: number } | null = null;

export function versionFromSha(sha: string): string {
  return sha.slice(0, 10);
}

// Git blob shas of both files, combined — a change to either gives a new
// version. Deterministic, so every server instance computes the same value.
export function combinedVersion(shaA: string, shaB: string): string {
  return versionFromSha(createHash("sha1").update(`${shaA}:${shaB}`).digest("hex"));
}

export async function getProjectRules(): Promise<{ version: string; content: string; fullRules: string }> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const branch = await gh.getDefaultBranch();
  const [agents, contributing] = await Promise.all([gh.getFile(RULES_PATH, branch), gh.getFile(FULL_RULES_PATH, branch)]);
  if (!agents) throw new Error(`${RULES_PATH} not found on ${branch}`);
  if (!contributing) throw new Error(`${FULL_RULES_PATH} not found on ${branch}`);
  cached = {
    version: combinedVersion(agents.sha, contributing.sha),
    content: agents.content,
    fullRules: contributing.content,
    at: Date.now(),
  };
  return cached;
}

let cachedGuides: { guides: Record<keyof typeof GUIDE_PATHS, string | null>; at: number } | null = null;

// A missing guide is returned as null rather than failing the whole call —
// the rules are what matter; the guides only speed things up.
export async function getProjectGuides(): Promise<Record<keyof typeof GUIDE_PATHS, string | null>> {
  if (cachedGuides && Date.now() - cachedGuides.at < CACHE_TTL_MS) return cachedGuides.guides;
  const branch = await gh.getDefaultBranch();
  const keys = Object.keys(GUIDE_PATHS) as Array<keyof typeof GUIDE_PATHS>;
  const files = await Promise.all(keys.map((k) => gh.getFile(GUIDE_PATHS[k], branch).catch(() => null)));
  const guides = Object.fromEntries(
    keys.map((k, i) => {
      const content = files[i]?.content ?? null;
      return [k, content && k === "projectStatus" ? statusBlock(content) : content];
    }),
  ) as Record<
    keyof typeof GUIDE_PATHS,
    string | null
  >;
  cachedGuides = { guides, at: Date.now() };
  return guides;
}

export async function listKnowledgeBase(): Promise<string[]> {
  const branch = await gh.getDefaultBranch();
  const entries = await gh.listDir(KNOWLEDGE_BASE_DIR, branch);
  return entries.filter((e) => e.type === "file" && e.path.endsWith(".md")).map((e) => e.path);
}

export function rulesVersionError(provided: unknown, current: string): string | null {
  if (typeof provided !== "string" || provided.trim() === "") {
    return `Blocked: call get_project_rules first, read and follow the rules it returns, then retry this call with ${RULES_VERSION_PARAM} set to its rulesVersion.`;
  }
  if (provided.trim() !== current) {
    return `Blocked: the project rules changed since you read them (you sent ${provided.trim()}, current is ${current}). Call get_project_rules again, re-read the rules, then retry with the new ${RULES_VERSION_PARAM}.`;
  }
  return null;
}

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export function withRulesVersionParam<T extends JsonSchema>(schema: T): T & { required: string[] } {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [RULES_VERSION_PARAM]: {
        type: "string",
        description: `The rulesVersion returned by get_project_rules. Required: proves the project rules (${RULES_PATH} and ${FULL_RULES_PATH}) were read this conversation.`,
      },
    },
    required: [
      ...(schema.required ?? []).filter((k) => k !== RULES_VERSION_PARAM),
      RULES_VERSION_PARAM,
    ],
  };
}

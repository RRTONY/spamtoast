// Files the MCP server's tools may never read or write, regardless of what a
// connected AI client asks for — closes off the agent editing its own gate,
// secrets, or build config. Checked on every read/write/delete tool call.
const DENYLIST_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  // next.config.ts is intentionally NOT blocked (redirects live there).
  /^package\.json$/i,
  /^pnpm-lock\.yaml$/i,
  /^pnpm-workspace\.yaml$/i,
  /^netlify\.toml$/i,
  /^\.mcp\.json$/i,
  /^\.github\//i,
  /^\.git\//i,
  // Runs on every matched request: a bad edit takes the whole site down.
  /^src\/proxy\.ts$/i,
  /^src\/lib\/admin\//i,
  // Signs the personal confrontation links; an edit could forge or break them.
  /^src\/lib\/spam\//i,
  /^src\/app\/api\/mcp\//i,
  // The MCP server's own sign-in (OAuth) endpoints and page.
  /^src\/app\/api\/oauth\//i,
  /^src\/app\/oauth\//i,
  /^src\/app\/\.well-known\//i,
];

// Denylisted files that hold no secrets, so the agent may read (never write)
// them — lets a connected session see build/deploy settings for debugging
// without being able to change them.
const READ_ONLY_PATTERNS: RegExp[] = [
  /^package\.json$/i,
  /^netlify\.toml$/i,
  /^\.github\/workflows\/[^/]+\.ya?ml$/i,
  /^src\/proxy\.ts$/i,
];

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function isPathDenied(path: string): boolean {
  const normalized = normalizePath(path);
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isPathReadDenied(path: string): boolean {
  const normalized = normalizePath(path);
  return isPathDenied(normalized) && !READ_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const ADMIN_BRANCH_PREFIX = "admin/mcp-";

// The branch holding the change records (change-store.ts). Never a change's
// branch, and no tool writes to it except through change-store.ts.
export const CHANGE_LOG_BRANCH = "mcp-change-log";

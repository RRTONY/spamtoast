import { ESLint } from "eslint";
import path from "path";

export interface CodeCheckMessage {
  line: number;
  severity: "error" | "warning";
  message: string;
  ruleId: string | null;
}

export interface CodeCheckResult {
  eslint: {
    errorCount: number;
    warningCount: number;
    messages: CodeCheckMessage[];
  };
  patternIssues: string[];
}

// This project's own house rules (CONTRIBUTING.md) that are cheap to check
// mechanically, on top of whatever generic ESLint already catches. Skips
// `src/components/ui/` (shadcn-generated files are exempt from the
// inline-style rule per CONTRIBUTING.md) and `globals.css` (the one
// documented raw-hex exception).
const PATTERN_CHECKS: Array<{
  test: (content: string, filePath: string) => boolean;
  message: string;
}> = [
  {
    test: (c, f) => !f.includes("components/ui/") && /style=\{\{/.test(c),
    message: "Inline style={{...}} found — use a Tailwind class instead (CONTRIBUTING.md's one documented exception is a build-time-unknowable dynamic value, e.g. a progress-bar width driven by state).",
  },
  {
    test: (c) => /<img[\s>]/.test(c),
    message: "Raw <img> tag found — use next/image's <Image> component instead.",
  },
  {
    test: (c) => /from ["']framer-motion["']/.test(c),
    message: "framer-motion import found — this project doesn't carry that dependency; use CSS transitions or tailwindcss-animate instead.",
  },
  {
    test: (c) => /bg-gradient-to-/.test(c),
    message: "Non-canonical Tailwind class `bg-gradient-to-*` found — this project's Tailwind v4 setup uses `bg-linear-to-*`.",
  },
  {
    test: (c) => /\bz-\[9999\]/.test(c),
    message: "Non-canonical Tailwind class `z-[9999]` found — use `z-9999`.",
  },
  {
    // Written so this file doesn't itself match the project's Manus grep.
    test: (c) => /manus(cdn\.com|-storage\/)|\/api\/img\//.test(c),
    message: "Manus-hosted URL found (Manus CDN, Manus storage, or the Manus image proxy) — zero Manus dependency, including temporarily. Host the asset somewhere permanent first.",
  },
  {
    test: (c) => /(Loading|Signing in|Submitting|Saving|Sending)(…|\.\.\.)/.test(c),
    message: "Ellipsis pending-state text found — show <Loader2 className=\"size-4 animate-spin\" /> next to the label instead (project rules).",
  },
  {
    test: (c, f) => !f.startsWith("src/lib/spam/") && /from ["']@\/lib\/spam\/confront-link["']/.test(c) && /^"use client"/.test(c.trimStart()),
    message: "confront-link.ts imported from a file that starts with \"use client\": it holds the link-signing secret and is server-only, so it must never reach a Client Component bundle.",
  },
];

export async function checkCode(filePath: string, content: string): Promise<CodeCheckResult> {
  // Only used so ESLint resolves the right config for this path — the content
  // is linted from memory, never read from disk. The ignore comment stops
  // Turbopack tracing the whole project into the server bundle.
  const absolutePath = path.join(/*turbopackIgnore: true*/ process.cwd(), filePath);

  // Imported here (not left for ESLint to find on disk) so the build's file
  // tracing follows every plugin and helper the config needs into the
  // serverless bundle; left to ESLint, they load where tracing can't see
  // them, and the live check failed with "Cannot find module 'fast-glob'"
  // (needed by @next/eslint-plugin-next). Loaded on first use, not at the
  // top, so MCP calls that never lint don't pay for loading every plugin.
  const { default: eslintConfig } = await import("../../../eslint.config.mjs");
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
  });
  const isIgnored = await eslint.isPathIgnored(absolutePath).catch(() => false);
  let eslintResult: CodeCheckResult["eslint"] = { errorCount: 0, warningCount: 0, messages: [] };
  if (!isIgnored && /\.(ts|tsx|js|jsx)$/.test(filePath)) {
    const [result] = await eslint.lintText(content, { filePath: absolutePath });
    eslintResult = {
      errorCount: result?.errorCount ?? 0,
      warningCount: result?.warningCount ?? 0,
      messages: (result?.messages ?? []).map((m) => ({
        line: m.line ?? 0,
        severity: m.severity === 2 ? "error" : "warning",
        message: m.message,
        ruleId: m.ruleId,
      })),
    };
  }

  const patternIssues = PATTERN_CHECKS.filter((p) => p.test(content, filePath)).map((p) => p.message);

  return { eslint: eslintResult, patternIssues };
}

const LINTABLE = /\.(ts|tsx|js|jsx|mjs)$/;

// The server's own lint run over a change's code files, for the review's
// "Lint" check. A file that can't be linted is reported as "could not run"
// (which blocks publishing), never silently counted as passed.
export async function lintChangedFiles(
  files: Array<{ path: string; content: string | null }>,
): Promise<
  Array<{
    path: string;
    errors: number;
    warnings: number;
    couldNotRun: string | null;
  }>
> {
  const results = [];
  for (const f of files.filter((f) => LINTABLE.test(f.path))) {
    if (f.content === null) continue;
    try {
      const r = await checkCode(f.path, f.content);
      results.push({
        path: f.path,
        errors: r.eslint.errorCount,
        warnings: r.eslint.warningCount,
        couldNotRun: null,
      });
    } catch (err) {
      results.push({
        path: f.path,
        errors: 0,
        warnings: 0,
        couldNotRun: (err instanceof Error ? err.message : String(err))
          .split("\n")[0]
          .slice(0, 200),
      });
    }
  }
  return results;
}

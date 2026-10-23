import * as gh from "@/lib/admin/github-client";
import { branchForChange, patchChangeSet, type ChangeSet } from "@/lib/admin/change-sets";
import type { AdminToolContext } from "@/lib/admin/tools";

export interface McpToolCallResult {
  ctx: AdminToolContext;
  auditLog: string[];
  // Opens the change's PR the moment its branch has its first commit (GitHub
  // rejects a PR with no diff from base, so this can't happen any earlier)
  // and saves the PR number on the change record, then reports the branch/PR
  // either way. Call once, after running the tool.
  finalize: () => Promise<{
    branch: string | null;
    prNumber: number | null;
    prUrl: string | null;
  }>;
}

const NO_CHANGE = "Start a change first (start_change) and pass its change_id.";

// MCP tool calls are independent HTTP requests with no memory between them
// (Netlify Functions), so every call that edits names the change it belongs
// to (change_id, from start_change), and this resolves that change's own
// branch and PR from its record. One request = one change = one branch, so
// two requests can never end up in the same Publish. With no change
// (read-only calls) reads come from the live site's code. GitHub is only
// asked for the default branch when a tool needs it, so the SEO, code-check
// and spam tools still work without GITHUB_TOKEN.
export async function buildMcpToolContext(change: ChangeSet | null): Promise<McpToolCallResult> {
  let defaultBranch: Promise<string> | null = null;
  let branch: string | null = change?.branch ?? null;
  let prNumber: number | null = change?.prNumber ?? null;
  const auditLog: string[] = [];

  const ctx: AdminToolContext = {
    getReadBranch: async () => branch ?? (await (defaultBranch ??= gh.getDefaultBranch())),
    ensureWriteBranch: async () => {
      if (!change) throw new Error(NO_CHANGE);
      if (branch) return branch;
      branch = branchForChange(change.key);
      await gh.createBranch(branch);
      await patchChangeSet(change.key, { branch });
      change.branch = branch;
      auditLog.push(`Created branch ${branch}`);
      return branch;
    },
    getPRNumber: async () => prNumber,
    log: (entry) => auditLog.push(entry),
  };

  return {
    ctx,
    auditLog,
    finalize: async () => {
      let prUrl: string | null = null;
      if (change && branch && !prNumber) {
        let pr: gh.OpenPR;
        try {
          pr = await gh.openPR(
            branch,
            change.title,
            `${change.request}\n\nRequested by ${change.requestedBy.name} via the SpamToast MCP server (change ${change.key}). Review it in Claude/ChatGPT before publishing.`,
          );
        } catch (err) {
          // 422 = the branch has no commits yet (the write failed); the PR
          // opens on the next successful write instead.
          if (gh.errorStatus(err) === 422) return { branch, prNumber, prUrl };
          throw err;
        }
        prNumber = pr.number;
        prUrl = pr.url;
        await patchChangeSet(change.key, { prNumber });
        change.prNumber = prNumber;
        auditLog.push(`Opened PR #${pr.number}`);
      } else if (prNumber) {
        prUrl = `https://github.com/${gh.GITHUB_REPO.owner}/${gh.GITHUB_REPO.repo}/pull/${prNumber}`;
      }
      return { branch, prNumber, prUrl };
    },
  };
}

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gh = vi.hoisted(() => ({ getDefaultBranch: vi.fn(), getFile: vi.fn(), listDir: vi.fn() }));
vi.mock("@/lib/admin/github-client", () => gh);

async function load() {
  vi.resetModules();
  return import("@/lib/admin/project-rules");
}

const files: Record<string, { content: string; sha: string } | null> = {
  "AGENTS.md": { content: "# Agents rules", sha: "aaaa1111" },
  "CONTRIBUTING.md": { content: "# Full rules", sha: "bbbb2222" },
  "docs/ai/TASK_GUIDE.md": { content: "task guide", sha: "1" },
  "docs/ai/PROJECT_STRUCTURE.md": null,
  "SPAMTOAST-TODO.md": { content: "# TODO\n\nintro\n\n## Current status\n\n- 10 done\n\n---\n\n## Phase 1\nlots", sha: "2" },
};

beforeEach(() => {
  gh.getDefaultBranch.mockResolvedValue("main");
  gh.getFile.mockImplementation(async (path: string) => files[path] ?? null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("versions", () => {
  it("versionFromSha keeps the first 10 characters", async () => {
    const { versionFromSha } = await load();
    expect(versionFromSha("0123456789abcdef")).toBe("0123456789");
  });

  it("combinedVersion is a deterministic hash of both shas, order-sensitive", async () => {
    const { combinedVersion } = await load();
    const expected = createHash("sha1").update("x:y").digest("hex").slice(0, 10);
    expect(combinedVersion("x", "y")).toBe(expected);
    expect(combinedVersion("y", "x")).not.toBe(expected);
  });
});

describe("getProjectRules", () => {
  it("returns AGENTS.md as content and CONTRIBUTING.md as full rules, with the combined version", async () => {
    const m = await load();
    await expect(m.getProjectRules()).resolves.toMatchObject({
      version: m.combinedVersion("aaaa1111", "bbbb2222"),
      content: "# Agents rules",
      fullRules: "# Full rules",
    });
    expect(gh.getFile).toHaveBeenCalledWith("AGENTS.md", "main");
    expect(gh.getFile).toHaveBeenCalledWith("CONTRIBUTING.md", "main");
  });

  it("caches for five minutes", async () => {
    vi.useFakeTimers();
    const m = await load();
    await m.getProjectRules();
    await m.getProjectRules();
    expect(gh.getFile).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await m.getProjectRules();
    expect(gh.getFile).toHaveBeenCalledTimes(4);
  });

  it("throws when either rules file is missing", async () => {
    gh.getFile.mockImplementation(async (p: string) => (p === "AGENTS.md" ? null : files[p]));
    await expect((await load()).getProjectRules()).rejects.toThrow("AGENTS.md not found on main");
    gh.getFile.mockImplementation(async (p: string) => (p === "CONTRIBUTING.md" ? null : files[p]));
    await expect((await load()).getProjectRules()).rejects.toThrow("CONTRIBUTING.md not found on main");
  });
});

describe("getProjectGuides", () => {
  it("returns guides, null for a missing one, and only the Current status block of the TODO", async () => {
    const guides = await (await load()).getProjectGuides();
    expect(guides).toEqual({ taskGuide: "task guide", projectStructure: null, projectStatus: "## Current status\n\n- 10 done" });
  });

  it("falls back to the top of the TODO when the heading is missing, and survives a failed read", async () => {
    gh.getFile.mockImplementation(async (p: string) => {
      if (p === "SPAMTOAST-TODO.md") return { content: "x".repeat(9000), sha: "3" };
      throw new Error("down");
    });
    const guides = await (await load()).getProjectGuides();
    expect(guides.projectStatus).toHaveLength(8000);
    expect(guides.taskGuide).toBeNull();
  });
});

describe("listKnowledgeBase", () => {
  it("lists only markdown files in docs/ai", async () => {
    gh.listDir.mockResolvedValue([
      { type: "file", path: "docs/ai/README.md" },
      { type: "dir", path: "docs/ai/img" },
      { type: "file", path: "docs/ai/diagram.png" },
    ]);
    await expect((await load()).listKnowledgeBase()).resolves.toEqual(["docs/ai/README.md"]);
    expect(gh.listDir).toHaveBeenCalledWith("docs/ai", "main");
  });
});

describe("rulesVersionError", () => {
  it("blocks when no version is sent", async () => {
    const { rulesVersionError } = await load();
    for (const v of [undefined, null, "", "   ", 123]) expect(rulesVersionError(v, "abc")).toMatch(/^Blocked: call get_project_rules first/);
  });

  it("blocks a stale version and names both", async () => {
    const { rulesVersionError } = await load();
    expect(rulesVersionError("old", "new")).toMatch(/you sent old, current is new/);
  });

  it("passes the current version, trimmed", async () => {
    const { rulesVersionError } = await load();
    expect(rulesVersionError(" abc ", "abc")).toBeNull();
  });
});

describe("withRulesVersionParam and the gated list", () => {
  it("adds a required rules_version without dropping existing fields", async () => {
    const { withRulesVersionParam } = await load();
    const s = withRulesVersionParam({ type: "object", properties: { path: { type: "string" } }, required: ["path"] });
    expect(s.required).toEqual(["path", "rules_version"]);
    expect(Object.keys(s.properties)).toEqual(["path", "rules_version"]);
    expect(withRulesVersionParam({ type: "object", properties: {} }).required).toEqual(["rules_version"]);
    // Never twice: a duplicate makes ChatGPT drop every tool (2026-10-17).
    expect(withRulesVersionParam({ type: "object", properties: {}, required: ["rules_version"] }).required).toEqual(["rules_version"]);
  });

  it("gates every tool that changes the site", async () => {
    const { RULES_GATED_TOOLS } = await load();
    for (const t of ["github_write_file", "github_edit_file", "github_write_binary_file", "github_delete_file", "add_to_wall_of_shame", "start_change", "confirm_change", "submit_for_review", "publish_changes", "undo_change", "discard_change", "request_upload_link"]) {
      expect(RULES_GATED_TOOLS.has(t), t).toBe(true);
    }
    expect(RULES_GATED_TOOLS.has("github_read_file")).toBe(false);
    expect(RULES_GATED_TOOLS.has("create_confrontation_link")).toBe(false);
    expect(RULES_GATED_TOOLS.has("list_wall_of_shame")).toBe(false);
  });
});

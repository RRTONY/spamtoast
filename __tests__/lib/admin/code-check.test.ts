import { describe, expect, it, vi } from "vitest";
import { checkCode, lintChangedFiles } from "@/lib/admin/code-check";

const eslint = vi.hoisted(() => ({ lintText: vi.fn(), isPathIgnored: vi.fn(), opts: null as unknown }));
vi.mock("eslint", () => ({
  ESLint: class {
    constructor(opts: unknown) {
      eslint.opts = opts;
    }
    lintText(...a: unknown[]) {
      return eslint.lintText(...a);
    }
    isPathIgnored(...a: unknown[]) {
      return eslint.isPathIgnored(...a);
    }
  },
}));
// Same relative path from this folder as from src/lib/admin: the repo root.
vi.mock("../../../eslint.config.mjs", () => ({ default: [{ rules: {} }] }));

const clean = () => {
  eslint.isPathIgnored.mockResolvedValue(false);
  eslint.lintText.mockResolvedValue([{ errorCount: 0, warningCount: 0, messages: [] }]);
};

describe("checkCode: house-rule patterns", () => {
  const cases: [string, string, RegExp][] = [
    ["src/app/x.tsx", '<div style={{ color: "red" }} />', /Inline style/],
    ["src/app/x.tsx", '<img src="/a.png" alt="" />', /Raw <img>/],
    ["src/app/x.tsx", 'import { motion } from "framer-motion";', /framer-motion/],
    ["src/app/x.tsx", '<div className="bg-gradient-to-r" />', /bg-gradient-to/],
    ["src/app/x.tsx", '<div className="z-[9999]" />', /z-\[9999\]/],
    ["src/app/x.tsx", 'const u = "https://files.manuscdn.com/a.png";', /Manus-hosted URL/],
    ["src/app/x.tsx", 'const u = "/api/img/abc";', /Manus-hosted URL/],
    ["src/app/x.tsx", '{pending ? "Saving..." : "Save"}', /Ellipsis pending-state/],
    ["src/app/x.tsx", '"use client";\nimport { createConfrontLink } from "@/lib/spam/confront-link";', /server-only/],
  ];

  it.each(cases)("%s flags %s", async (file, content, msg) => {
    clean();
    const { patternIssues } = await checkCode(file, content);
    expect(patternIssues.some((m) => msg.test(m))).toBe(true);
  });

  it("finds nothing in clean code", async () => {
    clean();
    const r = await checkCode("src/app/x.tsx", 'import Image from "next/image";\nexport default function P() { return <Image src="/a.png" alt="A" width={1} height={1} />; }');
    expect(r).toEqual({ eslint: { errorCount: 0, warningCount: 0, messages: [] }, patternIssues: [] });
  });

  it("exempts shadcn ui files from the inline-style rule", async () => {
    clean();
    expect((await checkCode("src/components/ui/progress.tsx", "<div style={{ transform: x }} />")).patternIssues).toEqual([]);
  });

  it("allows confront-link in a server file", async () => {
    clean();
    expect((await checkCode("src/app/actions.ts", 'import { createConfrontLink } from "@/lib/spam/confront-link";')).patternIssues).toEqual([]);
  });
});

describe("checkCode: ESLint", () => {
  it("lints the content from memory and maps messages", async () => {
    eslint.isPathIgnored.mockResolvedValue(false);
    eslint.lintText.mockResolvedValue([
      {
        errorCount: 1,
        warningCount: 1,
        messages: [
          { line: 3, severity: 2, message: "x is unused", ruleId: "no-unused-vars" },
          { severity: 1, message: "warn", ruleId: null },
        ],
      },
    ]);
    const r = await checkCode("src/app/x.ts", "const x = 1;");
    expect(r.eslint).toEqual({
      errorCount: 1,
      warningCount: 1,
      messages: [
        { line: 3, severity: "error", message: "x is unused", ruleId: "no-unused-vars" },
        { line: 0, severity: "warning", message: "warn", ruleId: null },
      ],
    });
    expect(eslint.lintText).toHaveBeenCalledWith("const x = 1;", { filePath: `${process.cwd()}/src/app/x.ts` });
    expect(eslint.opts).toMatchObject({ overrideConfigFile: true, overrideConfig: [{ rules: {} }] });
  });

  it("skips ESLint for ignored files and non-code files", async () => {
    eslint.isPathIgnored.mockResolvedValue(true);
    await checkCode("src/app/x.ts", "x");
    eslint.isPathIgnored.mockResolvedValue(false);
    await checkCode("docs/ai/x.md", "# hi");
    expect(eslint.lintText).not.toHaveBeenCalled();
  });
});

describe("lintChangedFiles", () => {
  it("lints only code files with content, and reports a failure as could-not-run", async () => {
    eslint.isPathIgnored.mockResolvedValue(false);
    eslint.lintText
      .mockResolvedValueOnce([{ errorCount: 2, warningCount: 0, messages: [] }])
      .mockRejectedValueOnce(new Error("Cannot find module 'fast-glob'\n  at stack"));
    const out = await lintChangedFiles([
      { path: "src/a.ts", content: "a" },
      { path: "README.md", content: "# r" },
      { path: "src/deleted.ts", content: null },
      { path: "src/b.tsx", content: "b" },
    ]);
    expect(out).toEqual([
      { path: "src/a.ts", errors: 2, warnings: 0, couldNotRun: null },
      { path: "src/b.tsx", errors: 0, warnings: 0, couldNotRun: "Cannot find module 'fast-glob'" },
    ]);
  });
});

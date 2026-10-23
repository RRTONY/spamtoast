import { describe, expect, it, vi } from "vitest";

// Own mock, so the test can check each font's real options (variable name,
// preload) rather than the shared fake's generic values.
const calls = vi.hoisted(() => ({}) as Record<string, { variable: string; preload?: boolean }>);
vi.mock("next/font/google", () => {
  const make = (name: string) => (opts: { variable: string; preload?: boolean }) => {
    calls[name] = opts;
    return { className: name, variable: opts.variable };
  };
  return { Fraunces: make("Fraunces"), Space_Grotesk: make("Space_Grotesk"), Cormorant_Garamond: make("Cormorant_Garamond") };
});

import { pageFontVariables } from "@/lib/fonts/page-fonts";

describe("pageFontVariables", () => {
  it("joins the three page fonts' CSS variable classes", () => {
    expect(pageFontVariables).toBe("--font-fraunces-face --font-space-grotesk --font-cormorant-face");
  });

  it("none of the page fonts are preloaded on every page", () => {
    expect(Object.values(calls).map((c) => c.preload)).toEqual([false, false, false]);
  });
});

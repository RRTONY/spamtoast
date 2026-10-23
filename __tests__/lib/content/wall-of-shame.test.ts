import { describe, expect, it } from "vitest";
import { SPAM_TYPES, WALL_OF_SHAME, rankedWall, type WallEntry } from "@/lib/content/wall-of-shame";

const entry = (company: string, reports: number, firstReported: string): WallEntry => ({
  company,
  spamType: "cold-outreach",
  reports,
  firstReported,
});

describe("wall of shame", () => {
  it("ranks by reports, then most recent, without changing the input", () => {
    const input = [entry("A", 1, "2026-01-01"), entry("B", 3, "2026-01-01"), entry("C", 1, "2026-05-01")];
    expect(rankedWall(input).map((e) => e.company)).toEqual(["B", "C", "A"]);
    expect(input.map((e) => e.company)).toEqual(["A", "B", "C"]);
  });

  it("every published entry is well formed", () => {
    for (const e of rankedWall()) {
      expect(e.company.trim()).not.toBe("");
      expect(e.spamType in SPAM_TYPES).toBe(true);
      expect(e.reports).toBeGreaterThan(0);
      expect(e.firstReported).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(Array.isArray(WALL_OF_SHAME)).toBe(true);
  });
});

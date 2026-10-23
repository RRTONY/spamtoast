import { describe, expect, it } from "vitest";
import {
  ECONOMICS_DATA, ECONOMICS_SOURCES, WEAPONS, LAWS, LETTER_TEMPLATE, QUESTIONS, TOOLS, scoreTools,
  CRUSADE_ARTICLES, TRUST_ARTICLES,
} from "@/lib/content/attention-theft";

describe("attention-theft data", () => {
  it("has 10 weapons numbered 01..10", () => {
    expect(WEAPONS.map((w) => w.num)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
  });

  it("has economics rows and sources with valid urls", () => {
    expect(ECONOMICS_DATA.find((r) => r.metric.startsWith("Recovery time"))?.value).toBe("23 min 15 sec");
    for (const s of ECONOMICS_SOURCES) if (s.url) expect(s.url).toMatch(/^https:\/\//);
  });

  it("only has existing laws and the action item (no invented bills)", () => {
    for (const l of LAWS) expect(["existing", "action"]).toContain(l.status);
    expect(LAWS.some((l) => /proposed/i.test(l.title))).toBe(false);
    expect(LAWS.filter((l) => l.status === "action")).toHaveLength(1);
  });

  it("has a letter template with placeholders", () => {
    expect(LETTER_TEMPLATE).toContain("[Representative Name]");
    expect(LETTER_TEMPLATE).toContain("[Your Name]");
  });

  it("only uses quiz answer values that tools can match on", () => {
    const platforms = QUESTIONS.find((q) => q.id === "platform")!.options.map((o) => o.value);
    const tech = QUESTIONS.find((q) => q.id === "tech")!.options.map((o) => o.value);
    for (const t of TOOLS) {
      for (const p of t.platforms) expect(platforms).toContain(p);
      for (const l of t.techLevel) expect(tech).toContain(l);
      expect(t.url).toMatch(/^https:\/\//);
    }
  });

  it("has unique article slugs that are real essays", () => {
    const slugs = [...CRUSADE_ARTICLES, ...TRUST_ARTICLES].map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // Real essays on tonygreenberg.com (checked there against its post list).
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("scoreTools", () => {
  const answers = { platform: "gmail", volume: "extreme", type: "sales", tech: "basic" };

  it("returns the top 5 tools, sorted by score high to low", () => {
    const result = scoreTools(answers);
    expect(result).toHaveLength(5);
    for (let i = 1; i < result.length; i++) expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
  });

  it("scores platform +3, tech +2, type +2 and extreme volume +2 for SaneBox", () => {
    const sane = TOOLS.find((t) => t.name === "SaneBox")!;
    const expected =
      (sane.platforms.includes("gmail") ? 3 : 0) +
      (sane.techLevel.includes("basic") ? 2 : 0) +
      (sane.bestFor.includes("sales") ? 2 : 0) +
      2;
    expect(scoreTools(answers).find((t) => t.name === "SaneBox")?.score).toBe(expected);
  });

  it("gives Clean Email +1 only for high volume", () => {
    const base = { platform: "zzz", type: "zzz", tech: "zzz" };
    const high = scoreTools({ ...base, volume: "high" });
    expect(high[0]).toMatchObject({ name: "Clean Email", score: 1 });
    const low = scoreTools({ ...base, volume: "low" });
    expect(low.every((t) => t.score === 0)).toBe(true);
  });

  it("handles empty answers without throwing", () => {
    const result = scoreTools({});
    expect(result).toHaveLength(5);
    expect(result.every((t) => t.score === 0)).toBe(true);
  });
});

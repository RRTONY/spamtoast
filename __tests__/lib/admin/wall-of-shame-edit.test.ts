import { describe, expect, it } from "vitest";
import { addWallEntry, validateWallInput, WALL_FILE } from "@/lib/admin/wall-of-shame-edit";

const TODAY = "2026-10-24";
const file = (list: string) => `// header\nexport const WALL_OF_SHAME: WallEntry[] = ${list};\n\nexport function rankedWall() {}\n`;

describe("validateWallInput", () => {
  it("cleans the input and fills defaults", () => {
    expect(validateWallInput({ company: "  Acme  ", domain: "https://Acme.IO/path", spamType: "cold-outreach", note: " Sent 4 pitches. " }, TODAY)).toEqual({
      ok: true,
      entry: { company: "Acme", domain: "acme.io", spamType: "cold-outreach", reports: 1, firstReported: TODAY, note: "Sent 4 pitches." },
    });
  });

  it.each([
    [{ company: " ", spamType: "cold-outreach" }, /company/],
    [{ company: "A", spamType: "rude" }, /spamType must be one of/],
    [{ company: "A", spamType: "cold-outreach", domain: "not a domain" }, /doesn't look like a domain/],
    [{ company: "A", spamType: "cold-outreach", reports: 0 }, /whole number/],
    [{ company: "A", spamType: "cold-outreach", reports: Number.NaN }, /whole number/],
    [{ company: "A", spamType: "cold-outreach", firstReported: "Oct 1" }, /date like/],
    [{ company: "A", spamType: "cold-outreach", firstReported: "2026-13-45" }, /date like/],
  ])("refuses %o", (input, error) => {
    const r = validateWallInput(input, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

describe("addWallEntry", () => {
  it("adds the first entry to an empty list, one JSON object per line", () => {
    const r = addWallEntry(file("[]"), { company: "Acme", spamType: "phishing-scam" }, TODAY);
    expect(r).toMatchObject({ ok: true, action: "added" });
    if (!r.ok) return;
    expect(r.content).toBe(file('[\n  {"company":"Acme","spamType":"phishing-scam","reports":1,"firstReported":"2026-10-24"},\n]'));
    expect(WALL_FILE).toBe("src/lib/content/wall-of-shame.ts");
  });

  it("counts another report for the same company or domain instead of a duplicate", () => {
    const start = file('[\n  {"company":"Acme","spamType":"cold-outreach","reports":2,"firstReported":"2026-10-10"},\n]');
    const byName = addWallEntry(start, { company: "ACME", spamType: "cold-outreach", firstReported: "2026-10-01", domain: "acme.io", note: "Again." }, TODAY);
    expect(byName).toMatchObject({ ok: true, action: "updated", entry: { company: "Acme", reports: 3, firstReported: "2026-10-01", domain: "acme.io", note: "Again." } });
    if (!byName.ok) return;
    const byDomain = addWallEntry(byName.content, { company: "Acme Inc", domain: "acme.io", spamType: "cold-outreach", reports: 4 }, TODAY);
    expect(byDomain).toMatchObject({ ok: true, action: "updated", entry: { company: "Acme", reports: 7, firstReported: "2026-10-01" } });
    if (byDomain.ok) expect(byDomain.content.match(/"company"/g)).toHaveLength(1);
  });

  it("adds a different sender after the existing ones, keeping a string with ] and commas intact", () => {
    const start = file('[\n  {"company":"A, B ]","spamType":"cold-outreach","reports":1,"firstReported":"2026-10-10"},\n]');
    const r = addWallEntry(start, { company: "Zed", spamType: "ai-generated-spam" }, TODAY);
    expect(r).toMatchObject({ ok: true, action: "added" });
    if (r.ok) {
      expect(r.content).toContain('"company":"A, B ]"');
      expect(r.content).toContain('"company":"Zed"');
      expect(r.content).toContain("export function rankedWall() {}");
    }
  });

  it("refuses when the list is missing or hand-formatted, and passes on bad input", () => {
    expect(addWallEntry("export const OTHER = [];", { company: "A", spamType: "cold-outreach" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't find/) });
    expect(addWallEntry(file("[\n  { company: \"A\" },\n]"), { company: "A", spamType: "cold-outreach" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/hand-formatted/) });
    expect(addWallEntry('export const WALL_OF_SHAME: WallEntry[] = [ "unterminated', { company: "A", spamType: "cold-outreach" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't find/) });
    expect(addWallEntry(file("[]"), { company: "", spamType: "cold-outreach" }, TODAY)).toMatchObject({ ok: false });
  });
});

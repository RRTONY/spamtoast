import { SPAM_TYPES, type SpamType, type WallEntry } from "@/lib/content/wall-of-shame";

// Adds a sender to src/lib/content/wall-of-shame.ts's WALL_OF_SHAME list (the
// add_to_wall_of_shame tool). Pure text in, text out: the tool reads the file
// on the change's branch and writes the result back there, so the entry goes
// through review and publish like any other edit.
//
// The list is rewritten in one canonical shape (one JSON object per entry,
// which is valid TypeScript), so this never has to understand hand-formatted
// code. If someone hand-edited the list into a shape that isn't plain JSON,
// it refuses and asks for github_edit_file instead of guessing.

export const WALL_FILE = "src/lib/content/wall-of-shame.ts";

const ARRAY_START = /export const WALL_OF_SHAME: WallEntry\[\] = \[/;

export interface WallInput {
  company: string;
  domain?: string;
  spamType: string;
  reports?: number;
  firstReported?: string;
  note?: string;
}

export type WallEditResult =
  | { ok: true; content: string; action: "added" | "updated"; entry: WallEntry }
  | { ok: false; error: string };

function findArray(source: string): { start: number; end: number } | null {
  const m = ARRAY_START.exec(source);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return { start: open, end: i + 1 };
  }
  return null;
}

const sameSender = (a: WallEntry, b: WallEntry) =>
  a.company.toLowerCase() === b.company.toLowerCase() ||
  (!!a.domain && !!b.domain && a.domain.toLowerCase() === b.domain.toLowerCase());

export function validateWallInput(input: WallInput, today: string): { ok: true; entry: WallEntry } | { ok: false; error: string } {
  const company = String(input.company ?? "").trim().slice(0, 120);
  if (!company) return { ok: false, error: "Say which company or sender (company)." };
  if (!(input.spamType in SPAM_TYPES)) {
    return { ok: false, error: `spamType must be one of: ${Object.keys(SPAM_TYPES).join(", ")}.` };
  }
  const domain = String(input.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return { ok: false, error: `"${domain}" doesn't look like a domain (e.g. example.com).` };
  }
  const reports = input.reports === undefined ? 1 : Math.floor(Number(input.reports));
  if (!Number.isFinite(reports) || reports < 1 || reports > 10000) {
    return { ok: false, error: "reports must be a whole number from 1 up." };
  }
  const firstReported = String(input.firstReported ?? today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstReported) || Number.isNaN(Date.parse(firstReported))) {
    return { ok: false, error: "firstReported must be a date like 2026-10-24." };
  }
  const note = String(input.note ?? "").trim().slice(0, 300);
  return {
    ok: true,
    entry: {
      company,
      ...(domain ? { domain } : {}),
      spamType: input.spamType as SpamType,
      reports,
      firstReported,
      ...(note ? { note } : {}),
    },
  };
}

export function addWallEntry(source: string, input: WallInput, today: string): WallEditResult {
  const valid = validateWallInput(input, today);
  if (!valid.ok) return valid;
  const range = findArray(source);
  if (!range) {
    return { ok: false, error: `Couldn't find the WALL_OF_SHAME list in ${WALL_FILE}. Edit it with github_edit_file instead.` };
  }
  let entries: WallEntry[];
  try {
    entries = JSON.parse(source.slice(range.start, range.end).replace(/,(\s*[\]}])/g, "$1")) as WallEntry[];
    if (!Array.isArray(entries)) throw new Error("not a list");
  } catch {
    return {
      ok: false,
      error: `The WALL_OF_SHAME list in ${WALL_FILE} was hand-formatted, so it can't be updated automatically. Edit it with github_edit_file instead.`,
    };
  }

  const incoming = valid.entry;
  const existing = entries.find((e) => sameSender(e, incoming));
  let entry: WallEntry;
  let action: "added" | "updated";
  if (existing) {
    // Same sender again: count it, keep the earliest date, fill gaps.
    entry = {
      ...existing,
      reports: existing.reports + (input.reports === undefined ? 1 : incoming.reports),
      firstReported: existing.firstReported < incoming.firstReported ? existing.firstReported : incoming.firstReported,
      ...(existing.domain || !incoming.domain ? {} : { domain: incoming.domain }),
      ...(incoming.note ? { note: incoming.note } : {}),
    };
    entries = entries.map((e) => (e === existing ? entry : e));
    action = "updated";
  } else {
    entry = incoming;
    entries = [...entries, entry];
    action = "added";
  }

  const body = entries.length ? `[\n${entries.map((e) => `  ${JSON.stringify(e)},`).join("\n")}\n]` : "[]";
  return { ok: true, content: source.slice(0, range.start) + body + source.slice(range.end), action, entry };
}

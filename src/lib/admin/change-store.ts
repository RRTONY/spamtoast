import * as gh from "@/lib/admin/github-client";
import { CHANGE_LOG_BRANCH } from "@/lib/admin/guardrails";

// Where change records live. The site has no database, so each change is one
// JSON file, `changes/<key>.json`, on its own GitHub branch
// (CHANGE_LOG_BRANCH). That branch is never a change's branch, is never
// merged, and is never given to a tool as a write target, so the agent can't
// rewrite history through the file tools. Records stay after publish or
// discard: they are the change history and what "undo" works from.
//
// Writes are read-modify-write on one small file. Two writes to the same
// record at the same moment would make GitHub refuse the second (409, stale
// sha); that one retries once on fresh data.

const DIR = "changes";

function recordPath(key: string): string {
  return `${DIR}/${key}.json`;
}

let branchReady = false;

async function ensureBranch(): Promise<void> {
  if (branchReady) return;
  if (!(await gh.branchExists(CHANGE_LOG_BRANCH))) {
    try {
      await gh.createBranch(CHANGE_LOG_BRANCH);
    } catch (err) {
      // Another request created it first.
      if (gh.errorStatus(err) !== 422) throw err;
    }
  }
  branchReady = true;
}

/** Test hook: forget that the branch was checked. */
export function resetChangeStoreCache(): void {
  branchReady = false;
}

export async function readRecord<T>(key: string): Promise<T | null> {
  await ensureBranch();
  const file = await gh.getFile(recordPath(key), CHANGE_LOG_BRANCH);
  if (!file) return null;
  try {
    return JSON.parse(file.content) as T;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown, message: string): Promise<void> {
  await gh.putFile(recordPath(key), `${JSON.stringify(value, null, 2)}\n`, message, CHANGE_LOG_BRANCH);
}

export async function createRecord<T extends { key: string }>(doc: T): Promise<void> {
  await ensureBranch();
  await write(doc.key, doc, `Change ${doc.key}: created`);
}

export async function patchRecord<T extends object>(key: string, fields: Partial<T>): Promise<void> {
  await ensureBranch();
  for (let attempt = 0; ; attempt++) {
    const current = await readRecord<T>(key);
    if (!current) throw new Error(`No change record ${key}.`);
    try {
      await write(key, { ...current, ...fields }, `Change ${key}: update`);
      return;
    } catch (err) {
      if (attempt === 0 && gh.errorStatus(err) === 409) continue;
      throw err;
    }
  }
}

/** Newest first. Reads at most `limit` records after filtering. */
export async function listRecords<T extends { createdAt: string }>(
  filter: (doc: T) => boolean,
  limit: number,
): Promise<T[]> {
  await ensureBranch();
  let entries: gh.DirEntry[];
  try {
    entries = await gh.listDir(DIR, CHANGE_LOG_BRANCH);
  } catch (err) {
    if (gh.isNotFound(err)) return [];
    throw err;
  }
  // Keys start with the date (YYYYMMDD-xxxxxx), so the newest files sort
  // last; read from the end and stop once enough match.
  const keys = entries
    .filter((e) => e.type === "file" && e.path.endsWith(".json"))
    .map((e) => e.path.slice(DIR.length + 1, -".json".length))
    .sort()
    .reverse()
    .slice(0, 300);
  const out: T[] = [];
  for (let i = 0; i < keys.length && out.length < limit; i += 10) {
    const batch = await Promise.all(keys.slice(i, i + 10).map((k) => readRecord<T>(k)));
    for (const doc of batch) if (doc && filter(doc)) out.push(doc);
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, limit);
}

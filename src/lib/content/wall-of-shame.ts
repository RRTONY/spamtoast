// The public Wall of Shame on spamtoast.com (homepage, #wall-of-shame).
// There's no database: this list is the record. Entries are added through
// the MCP server's `add_to_wall_of_shame` tool, which opens a reviewed change
// like any other edit, so nothing appears publicly until Tony publishes it.
// Naming a company publicly is a claim about them: only add senders Tony has
// confirmed spammed him, and keep `note` to what happened, not opinion.
// The section is hidden while the list is empty.

export const SPAM_TYPES = {
  "cold-outreach": "Cold Outreach / Sales Pitch",
  "unsolicited-newsletter": "Unsolicited Newsletter",
  "ai-generated-spam": "AI-Generated Personalized Spam",
  "phishing-scam": "Phishing / Scam",
} as const;

export type SpamType = keyof typeof SPAM_TYPES;

export interface WallEntry {
  company: string;
  /** Sending domain, e.g. "example.com". */
  domain?: string;
  spamType: SpamType;
  /** How many separate times Tony (or readers) reported them. */
  reports: number;
  /** First report, YYYY-MM-DD. */
  firstReported: string;
  /** One plain sentence: what they sent. */
  note?: string;
}

export const WALL_OF_SHAME: WallEntry[] = [];

/** Most-reported first, then most recent. */
export function rankedWall(entries: WallEntry[] = WALL_OF_SHAME): WallEntry[] {
  return [...entries].sort((a, b) => b.reports - a.reports || b.firstReported.localeCompare(a.firstReported));
}

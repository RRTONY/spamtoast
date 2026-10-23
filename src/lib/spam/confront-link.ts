import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Personal "You've been reported" links (/youve-been-reported). There's no
// database, so a link carries its own details plus an HMAC signature: only
// someone with CONFRONT_LINK_SECRET (the MCP server, Tony's team) can make
// one, and a changed company name or email breaks the signature. A link
// that doesn't verify shows the page's generic version and notifies nobody.

export interface ConfrontTarget {
  company: string;
  domain?: string;
  email?: string;
}

const MAX = { company: 120, domain: 120, email: 200 } as const;

function secret(): string | null {
  return process.env.CONFRONT_LINK_SECRET || null;
}

function clean(t: ConfrontTarget): ConfrontTarget {
  return {
    company: t.company.trim().slice(0, MAX.company),
    domain: t.domain?.trim().toLowerCase().slice(0, MAX.domain) || undefined,
    email: t.email?.trim().toLowerCase().slice(0, MAX.email) || undefined,
  };
}

function sign(t: ConfrontTarget, key: string): string {
  const payload = [t.company, t.domain ?? "", t.email ?? ""].join("\n");
  return createHmac("sha256", key).update(payload).digest("base64url").slice(0, 22);
}

export function isConfrontLinkConfigured(): boolean {
  return secret() !== null;
}

/** Builds a signed link. Throws if CONFRONT_LINK_SECRET isn't set. */
export function createConfrontLink(target: ConfrontTarget, origin: string): string {
  const key = secret();
  if (!key) throw new Error("CONFRONT_LINK_SECRET is not set.");
  const t = clean(target);
  if (!t.company) throw new Error("A company name is required.");
  const url = new URL("/youve-been-reported", origin);
  url.searchParams.set("company", t.company);
  if (t.domain) url.searchParams.set("domain", t.domain);
  if (t.email) url.searchParams.set("email", t.email);
  url.searchParams.set("sig", sign(t, key));
  return url.toString();
}

/** Returns the target when the signature matches, otherwise null. */
export function verifyConfrontParams(params: Record<string, string | string[] | undefined>): ConfrontTarget | null {
  const key = secret();
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const company = one("company");
  const sig = one("sig");
  if (!key || !company || !sig) return null;
  const t = clean({ company, domain: one("domain"), email: one("email") });
  const expected = Buffer.from(sign(t, key));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? t : null;
}

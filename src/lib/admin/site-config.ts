// Where this MCP server's changes go: one Netlify site and its public
// address. Read from the server's env only, never from a tool parameter.

export const DEFAULT_NETLIFY_SITE_NAME = "spamtoast";
export const DEFAULT_SITE_ORIGIN = "https://spamtoast.com";
export const BRAND = "SpamToast";

function clean(name: string | undefined): string {
  const v = (name ?? "").trim();
  return /^[a-z0-9-]+$/i.test(v) ? v : DEFAULT_NETLIFY_SITE_NAME;
}

/** Netlify site name (the "<name>.netlify.app" part). */
export function netlifySiteName(): string {
  return clean(process.env.NETLIFY_SITE_NAME);
}

/** Netlify site id; the API also accepts "<name>.netlify.app". */
export function netlifySiteId(): string {
  return process.env.NETLIFY_SITE_ID?.trim() || `${netlifySiteName()}.netlify.app`;
}

export function previewUrlForPr(prNumber: number): string {
  return `https://deploy-preview-${prNumber}--${netlifySiteName()}.netlify.app`;
}

/** The live site, e.g. https://spamtoast.com (no trailing slash). */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw && /^https?:\/\/[^\s/]+/i.test(raw)) return raw.replace(/\/+$/, "");
  return DEFAULT_SITE_ORIGIN;
}

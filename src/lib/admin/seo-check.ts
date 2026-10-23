import { siteOrigin } from "@/lib/admin/site-config";

// Lightweight, regex-based extraction of the SEO-relevant tags from a live
// page's rendered HTML. Deliberately not pulling in an HTML parser dependency
// for a handful of well-formed tags Next.js always emits consistently.
export interface SeoCheckResult {
  url: string;
  status: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  h1Count: number;
  h1s: string[];
  jsonLdBlocks: number;
}

// Next.js renders these tags with entity-encoded text content — decode the
// common ones so the reported title/description match what's actually shown.
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // React writes an apostrophe as &#x27;, so numeric and hex forms too.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

// Pure parsing logic, separated from the network fetch so it's unit-testable
// against a fixed HTML string without hitting the live site.
export function parseSeoFromHtml(
  html: string,
  url: string,
  status: number,
): SeoCheckResult {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const metaDescription = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i,
  )?.[1];
  const canonical =
    html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)?.[1] ??
    null;
  const ogTitle = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i,
  )?.[1];
  const ogImage =
    html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i,
    )?.[1] ?? null;
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "").trim()),
  );
  const jsonLdBlocks = (
    html.match(/<script[^>]+type=["']application\/ld\+json["']/gi) || []
  ).length;

  const decodedTitle = title !== undefined ? decodeEntities(title) : null;
  const decodedDescription =
    metaDescription !== undefined ? decodeEntities(metaDescription) : null;
  const decodedOgTitle = ogTitle !== undefined ? decodeEntities(ogTitle) : null;

  return {
    url,
    status,
    title: decodedTitle,
    titleLength: decodedTitle?.length ?? 0,
    metaDescription: decodedDescription,
    metaDescriptionLength: decodedDescription?.length ?? 0,
    canonical,
    ogTitle: decodedOgTitle,
    ogImage,
    h1Count: h1s.length,
    h1s,
    jsonLdBlocks,
  };
}

// Checks the deployed site, not the working branch. MCP_SITE_ORIGIN points it
// somewhere else (e.g. the Netlify address before the domain is connected)
// without touching NEXT_PUBLIC_SITE_URL, which drives canonical URLs.
const SITE_URL = (process.env.MCP_SITE_ORIGIN || siteOrigin()).replace(/\/+$/, "");

export async function checkPageSeo(path: string): Promise<SeoCheckResult> {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SpamToast-MCP-SEO-Check/1.0" },
  });
  const html = await res.text();
  return parseSeoFromHtml(html, url, res.status);
}

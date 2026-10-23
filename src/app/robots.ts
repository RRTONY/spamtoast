import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://spamtoast.com";

// Personal confrontation links and the MCP server stay out of search
// engines; everything else is open. (Netlify copies are kept out by the
// X-Robots-Tag header in next.config.ts.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/youve-been-reported", "/api/"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

import { siteOrigin } from "@/lib/admin/site-config";

// Runs a real Lighthouse audit via Google's free PageSpeed Insights API v5 —
// this actually executes Lighthouse on Google's infrastructure, so there's no
// need to bundle headless Chrome into a serverless function (which wouldn't
// fit anyway). GOOGLE_API_KEY is required, not just a rate-limit nicety —
// confirmed live (2026-09-04) that Google's anonymous quota for this API is
// actually 0 ("quota_limit_value": "0" in the 429 body), not just "low."
export interface LighthouseIssue {
  id: string;
  title: string;
  category: string;
  score: number | null;
  description: string;
}

export interface LighthouseCheckResult {
  url: string;
  strategy: "mobile" | "desktop";
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  topIssues: LighthouseIssue[];
}

interface PsiCategory {
  score: number | null;
  auditRefs: Array<{ id: string }>;
}

interface PsiAudit {
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
}

// Pure parsing/scoring logic, separated from the network fetch so it's
// unit-testable against a fixed PSI response without hitting the live API.
export function parseLighthouseResult(
  data: {
    lighthouseResult?: {
      categories?: Record<string, PsiCategory>;
      audits?: Record<string, PsiAudit>;
    };
  },
  targetUrl: string,
  strategy: "mobile" | "desktop",
): LighthouseCheckResult {
  const categories: Record<string, PsiCategory> =
    data.lighthouseResult?.categories ?? {};
  const audits: Record<string, PsiAudit> = data.lighthouseResult?.audits ?? {};

  const scoreOf = (id: string): number | null => {
    const raw = categories[id]?.score;
    return typeof raw === "number" ? Math.round(raw * 100) : null;
  };

  const candidates: Array<{ id: string; category: string; audit: PsiAudit }> =
    [];
  for (const [categoryId, category] of Object.entries(categories)) {
    for (const ref of category.auditRefs || []) {
      const audit = audits[ref.id];
      if (audit) candidates.push({ id: ref.id, category: categoryId, audit });
    }
  }

  const topIssues: LighthouseIssue[] = candidates
    .filter(
      ({ audit }) =>
        typeof audit.score === "number" &&
        audit.score < 0.9 &&
        audit.scoreDisplayMode !== "notApplicable" &&
        audit.scoreDisplayMode !== "informative",
    )
    .sort((a, b) => (a.audit.score ?? 1) - (b.audit.score ?? 1))
    .slice(0, 10)
    .map(({ id, category, audit }) => ({
      id,
      title: audit.title,
      category,
      score: audit.score,
      description: audit.description
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .slice(0, 200),
    }));

  return {
    url: targetUrl,
    strategy,
    scores: {
      performance: scoreOf("performance"),
      accessibility: scoreOf("accessibility"),
      bestPractices: scoreOf("best-practices"),
      seo: scoreOf("seo"),
    },
    topIssues,
  };
}

// PageSpeed runs on Google's servers, so it can only reach a public URL: the
// same origin seo_check_page uses, never a localhost dev server.
const SITE_URL = (process.env.MCP_SITE_ORIGIN || siteOrigin()).replace(/\/+$/, "");

export async function checkLighthouse(
  path: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<LighthouseCheckResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured (PageSpeed Insights has no anonymous quota).");
  }
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(SITE_URL)) {
    throw new Error(`PageSpeed can't reach ${SITE_URL}; set MCP_SITE_ORIGIN to a public URL.`);
  }
  const targetUrl = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const params = new URLSearchParams({ url: targetUrl, strategy });
  for (const category of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    params.append("category", category);
  }
  params.set("key", apiKey);

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `PageSpeed Insights request failed: ${res.status} ${body.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  return parseLighthouseResult(data, targetUrl, strategy);
}

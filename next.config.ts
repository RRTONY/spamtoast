import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP server's code check (src/lib/admin/code-check.ts) runs ESLint
  // programmatically; bundling ESLint fails, so it stays an external package
  // (same setting as tonygreenberg.com).
  serverExternalPackages: ["eslint", "eslint-config-next"],
  async headers() {
    return [
      // Baseline security headers on every page (same set as tonygreenberg.com).
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
      // Keep the Netlify copies (main *.netlify.app URL and deploy previews)
      // out of search results; spamtoast.com itself stays indexable.
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<host>.+)\\.netlify\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // Confrontation links are personal; never index them.
      {
        source: "/youve-been-reported",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      // The manifesto is the homepage here. Old tonygreenberg.com paths and
      // section addresses land on the matching part of it.
      { source: "/attention-theft", destination: "/", permanent: true },
      { source: "/manifesto", destination: "/", permanent: true },
      { source: "/attention-theft/economics", destination: "/#heresy", permanent: true },
      { source: "/:section(blocker-finder|legal|weapons|report)", destination: "/#:section", permanent: true },
      { source: "/attention-theft/:section(blocker-finder|legal|weapons|report)", destination: "/#:section", permanent: true },
      { source: "/spamtoast", destination: "/", permanent: true },
    ];
  },
  images: {
    // Images come straight from Sanity's CDN (tonygreenberg.com's Sanity
    // project, where the manifesto photos already live); see the loader.
    loader: "custom",
    loaderFile: "./src/lib/images/image-loader.ts",
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
};

export default nextConfig;

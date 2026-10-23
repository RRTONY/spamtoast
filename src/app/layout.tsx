import type { Metadata } from "next";
import { preconnect } from "react-dom";
import { Playfair_Display, DM_Mono, Source_Sans_3 } from "next/font/google";
import { ManifestoNav } from "@/components/manifesto/manifesto-nav";
import { ManifestoFooter } from "@/components/manifesto/manifesto-footer";
import { pageFontVariables } from "@/lib/fonts/page-fonts";
import "./globals.css";

// Same fonts as tonygreenberg.com; every heading is Fraunces, as on its
// /attention-theft section (font-heading points at it here).
const playfairDisplay = Playfair_Display({ variable: "--font-display", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });
const sourceSans3 = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://spamtoast.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "SpamToast | Attention Theft: The Manifesto", template: "%s | SpamToast" },
  description: "The case against attention theft: why your inbox is a crime scene and what to do about it.",
  applicationName: "SpamToast",
  authors: [{ name: "Tony Greenberg", url: "https://tonygreenberg.com" }],
  creator: "Tony Greenberg",
  // The share image is src/app/opengraph-image.tsx (Next adds it to every page).
  openGraph: { type: "website", siteName: "SpamToast", locale: "en_US", url: "/" },
  twitter: { card: "summary_large_image" },
};

// Structured data for search engines and AI answers: the site, and the
// manifesto as an article by Tony (same Person id as tonygreenberg.com).
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "SpamToast", url: siteUrl, inLanguage: "en" },
    {
      "@type": "Article",
      "@id": `${siteUrl}/#manifesto`,
      headline: "Attention Theft: The Manifesto",
      description: "The case against attention theft: why your inbox is a crime scene and what to do about it.",
      url: siteUrl,
      isPartOf: { "@id": `${siteUrl}/#website` },
      author: { "@type": "Person", "@id": "https://tonygreenberg.com/#person", name: "Tony Greenberg", url: "https://tonygreenberg.com" },
      image: `${siteUrl}/opengraph-image`,
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  preconnect("https://cdn.sanity.io");
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${dmMono.variable} ${sourceSans3.variable} ${pageFontVariables} h-full scroll-smooth antialiased [--font-display:var(--font-fraunces-face),Georgia,serif]`}
    >
      <body className="flex min-h-full flex-col text-crusade-ink" suppressHydrationWarning>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ManifestoNav />
        <main className="flex-1">{children}</main>
        <ManifestoFooter />
      </body>
    </html>
  );
}

import { describe, expect, it, vi } from "vitest";
import { checkPageSeo, decodeEntities, parseSeoFromHtml } from "@/lib/admin/seo-check";

const HTML = `<!doctype html><html><head>
<title>Tony &amp; the Moat | Tony Greenberg</title>
<meta name="description" content="It&#x27;s about trust &quot;earned&quot;."/>
<link rel="canonical" href="https://spamtoast.com/blog/moat"/>
<meta property="og:title" content="Moat &lt;3"/>
<meta property="og:image" content="https://cdn.sanity.io/x.png"/>
<script type="application/ld+json">{}</script><script type="application/ld+json">{}</script>
</head><body><h1 class="x">The <em>Moat</em> &#39;24</h1></body></html>`;

describe("decodeEntities", () => {
  it("decodes named, hex and decimal entities", () => {
    expect(decodeEntities("&amp;&quot;&apos;&lt;&gt;&#x27;&#39;&#x2014;")).toBe(`&"'<>''—`);
  });
});

describe("parseSeoFromHtml", () => {
  it("extracts and decodes the SEO tags", () => {
    expect(parseSeoFromHtml(HTML, "https://x/blog/moat", 200)).toEqual({
      url: "https://x/blog/moat",
      status: 200,
      title: "Tony & the Moat | Tony Greenberg",
      titleLength: 32,
      metaDescription: `It's about trust "earned".`,
      metaDescriptionLength: 26,
      canonical: "https://spamtoast.com/blog/moat",
      ogTitle: "Moat <3",
      ogImage: "https://cdn.sanity.io/x.png",
      h1Count: 1,
      h1s: ["The Moat '24"],
      jsonLdBlocks: 2,
    });
  });

  it("reports missing tags as null / zero", () => {
    expect(parseSeoFromHtml("<html><body><p>hi</p></body></html>", "u", 404)).toEqual({
      url: "u",
      status: 404,
      title: null,
      titleLength: 0,
      metaDescription: null,
      metaDescriptionLength: 0,
      canonical: null,
      ogTitle: null,
      ogImage: null,
      h1Count: 0,
      h1s: [],
      jsonLdBlocks: 0,
    });
  });

  it("counts every h1", () => {
    expect(parseSeoFromHtml("<h1>A</h1><h1>B</h1>", "u", 200).h1s).toEqual(["A", "B"]);
  });
});

describe("checkPageSeo", () => {
  it("fetches the page on the site origin, adding a leading slash", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkPageSeo("blog/moat");
    expect(r.url).toBe("https://spamtoast.com/blog/moat");
    expect(r.title).toBe("Tony & the Moat | Tony Greenberg");
    expect(fetchMock).toHaveBeenCalledWith("https://spamtoast.com/blog/moat", { headers: { "User-Agent": "SpamToast-MCP-SEO-Check/1.0" } });
  });

  it("passes the real status code through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Not found</title>", { status: 404 })));
    await expect(checkPageSeo("/nope")).resolves.toMatchObject({ status: 404, title: "Not found" });
  });
});

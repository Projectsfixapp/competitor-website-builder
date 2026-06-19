import { describe, expect, it, vi, beforeEach } from "vitest";

const safeFetchTextMock = vi.fn();

vi.mock("./_core/ssrf", () => ({
  safeFetchText: (...args: unknown[]) => safeFetchTextMock(...args),
}));

import { scrapePage } from "./scraper";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <title>Mustermann Bau GmbH</title>
  <meta name="description" content="Tiefbau und Erdarbeiten seit 1995">
  <meta name="robots" content="index, follow">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.com/">
  <meta property="og:title" content="Mustermann Bau">
  <meta property="og:description" content="Ihr Partner fuer Tiefbau">
  <meta property="og:image" content="/og.jpg">
  <script type="application/ld+json">{"@type":"LocalBusiness","name":"Mustermann Bau GmbH"}</script>
  <script>console.log("should not appear in fullText");</script>
</head>
<body>
  <header>
    <nav><a href="/leistungen">Leistungen</a><a href="/kontakt">Kontakt</a></nav>
  </header>
  <h1>Willkommen bei Mustermann Bau</h1>
  <h2>Unsere Leistungen</h2>
  <p>Wir bieten seit ueber 25 Jahren professionellen Tiefbau in der Region an, mit modernster Technik.</p>
  <img src="/team.jpg" alt="Unser Team" width="800" height="600">
  <img src="https://cdn.example.com/logo.png" alt="Logo">
  <img src="data:image/png;base64,abc123" alt="inline">
  <button class="btn-primary">Jetzt anfragen</button>
  <a class="cta-link" href="/kontakt">Kostenloses Angebot</a>
</body>
</html>`;

describe("scrapePage", () => {
  beforeEach(() => {
    safeFetchTextMock.mockReset();
  });

  it("extracts title, meta description, headings, paragraphs, CTAs and nav", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) {
        throw new Error("not found");
      }
      return SAMPLE_HTML;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.title).toBe("Mustermann Bau GmbH");
    expect(page.metaDescription).toBe("Tiefbau und Erdarbeiten seit 1995");
    expect(page.headlines).toContain("Willkommen bei Mustermann Bau");
    expect(page.headings).toEqual(
      expect.arrayContaining([
        { level: 1, text: "Willkommen bei Mustermann Bau" },
        { level: 2, text: "Unsere Leistungen" },
      ])
    );
    expect(page.paragraphs[0]).toContain("Tiefbau in der Region");
    expect(page.ctaTexts).toContain("Jetzt anfragen");
    expect(page.ctaTexts).toContain("Kostenloses Angebot");
    expect(page.navItems).toEqual(["Leistungen", "Kontakt"]);
  });

  it("extracts images with resolved absolute URLs and dimensions, skipping data: URIs", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return SAMPLE_HTML;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.images).toEqual([
      { url: "https://example.com/team.jpg", alt: "Unser Team", width: 800, height: 600 },
      { url: "https://cdn.example.com/logo.png", alt: "Logo", width: null, height: null },
    ]);
  });

  it("extracts SEO meta tags and JSON-LD", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return SAMPLE_HTML;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.seo.canonical).toBe("https://example.com/");
    expect(page.seo.robots).toBe("index, follow");
    expect(page.seo.ogTitle).toBe("Mustermann Bau");
    expect(page.seo.ogImage).toBe("/og.jpg");
    expect(page.seo.lang).toBe("de");
    expect(page.seo.jsonLd).toEqual([{ "@type": "LocalBusiness", name: "Mustermann Bau GmbH" }]);
  });

  it("excludes <script>/<style> text from fullText", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return SAMPLE_HTML;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.fullText).not.toContain("should not appear in fullText");
    expect(page.fullText).toContain("Willkommen bei Mustermann Bau");
  });

  it("discovers sitemap URLs via robots.txt Sitemap: directive", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/") return SAMPLE_HTML;
      if (url === "https://example.com/robots.txt") {
        return "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap-custom.xml";
      }
      if (url === "https://example.com/sitemap-custom.xml") {
        return `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`;
      }
      throw new Error("not found");
    });

    const page = await scrapePage("https://example.com/");

    expect(page.sitemapUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("falls back to /sitemap.xml when robots.txt has no Sitemap: directive", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/") return SAMPLE_HTML;
      if (url === "https://example.com/robots.txt") return "User-agent: *\nDisallow:";
      if (url === "https://example.com/sitemap.xml") {
        return `<urlset><url><loc>https://example.com/c</loc></url></urlset>`;
      }
      throw new Error("not found");
    });

    const page = await scrapePage("https://example.com/");

    expect(page.sitemapUrls).toEqual(["https://example.com/c"]);
  });

  it("returns an empty sitemapUrls array (not a thrown error) when neither robots.txt nor sitemap.xml exist", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/") return SAMPLE_HTML;
      throw new Error("404");
    });

    const page = await scrapePage("https://example.com/");

    expect(page.sitemapUrls).toEqual([]);
  });

  it("falls back to alt-text matching 'logo' when no header/nav image exists", async () => {
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return SAMPLE_HTML;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.logoUrl).toBe("https://cdn.example.com/logo.png");
  });

  it("prefers a header/nav image over an alt-text match elsewhere on the page", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body>
      <header><img src="/brand-logo.svg" alt="Firmenlogo"></header>
      <img src="/unrelated-logo-shaped-icon.png" alt="logo decoration">
      </body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.logoUrl).toBe("https://example.com/brand-logo.svg");
  });

  it("returns null logoUrl when no candidate exists", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body><img src="/random.jpg" alt="Baustelle"></body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.logoUrl).toBeNull();
  });

  it("extracts the theme-color meta tag as the first brand color", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title><meta name="theme-color" content="#1E88E5"></head><body><p>Hallo</p></body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.brandColors[0]).toBe("#1e88e5");
  });

  it("extracts the most frequent vivid colors from inline styles and <style> blocks", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title>
      <style>.btn { background-color: #ff6600; } .btn2 { background-color: #ff6600; }</style>
      </head><body>
      <div style="color: #ff6600;">A</div>
      <div style="color: #003366;">B</div>
      </body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.brandColors[0]).toBe("#ff6600"); // appears 3x vs. #003366's 1x
    expect(page.brandColors).toContain("#003366");
  });

  it("excludes near-white, near-black, and grey colors from brandColors", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body>
      <div style="color: #ffffff; background: #000000; border-color: #888888;">text</div>
      <div style="color: #cc3366;">accent</div>
      </body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.brandColors).toEqual(["#cc3366"]);
  });

  it("returns an empty brandColors array when nothing vivid is found", async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body><div style="color:#fff">x</div></body></html>`;
    safeFetchTextMock.mockImplementation(async (url: string) => {
      if (url.includes("robots.txt") || url.includes("sitemap.xml")) throw new Error("not found");
      return html;
    });

    const page = await scrapePage("https://example.com/");

    expect(page.brandColors).toEqual([]);
  });
});

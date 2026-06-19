/**
 * Scraping Engine
 * Fetches competitor URLs server-side and extracts structured content:
 * text/headings/CTAs/nav (as before), plus images, SEO meta/JSON-LD, and
 * sitemap URLs. No headless browser (Playwright) — kept deliberately on
 * fetch()+cheerio because the app runs on Render's free tier, where a
 * headless Chromium process is a real OOM risk; the data this phase adds
 * (images, meta tags, JSON-LD, sitemap) lives in the raw HTML for the large
 * majority of SMB/competitor sites without needing JS rendering at all.
 */

import * as cheerio from "cheerio";
import { safeFetchText } from "./_core/ssrf";

export interface ScrapedImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ScrapedHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface ScrapedSeoMeta {
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  viewport: string | null;
  lang: string | null;
  jsonLd: unknown[];
}

export interface ScrapedPage {
  url: string;
  title: string;
  metaDescription: string;
  headlines: string[];
  headings: ScrapedHeading[];
  paragraphs: string[];
  ctaTexts: string[];
  navItems: string[];
  images: ScrapedImage[];
  seo: ScrapedSeoMeta;
  sitemapUrls: string[];
  fullText: string;
}

const SITEMAP_TIMEOUT_MS = 8000;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseDimension(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveBaseUrl(pageUrl: string, $: cheerio.CheerioAPI): string {
  const baseHref = $("base").first().attr("href");
  if (!baseHref) return pageUrl;
  try {
    return new URL(baseHref, pageUrl).toString();
  } catch {
    return pageUrl;
  }
}

function dedupeImages(images: ScrapedImage[]): ScrapedImage[] {
  const seen = new Set<string>();
  const result: ScrapedImage[] = [];
  for (const img of images) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    result.push(img);
  }
  return result;
}

/**
 * Best-effort sitemap discovery: robots.txt "Sitemap:" directives first,
 * falling back to the conventional /sitemap.xml location. Failures here
 * (missing robots.txt, no sitemap) are swallowed — this is supplementary
 * data, not required for the scrape to succeed.
 */
async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const fetchWithTimeout = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SITEMAP_TIMEOUT_MS);
    try {
      return await safeFetchText(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const sitemapCandidates: string[] = [];
  try {
    const robotsTxt = await fetchWithTimeout(`${origin}/robots.txt`);
    for (const m of Array.from(robotsTxt.matchAll(/^sitemap:\s*(\S+)/gim))) {
      sitemapCandidates.push(m[1]!);
    }
  } catch {
    // robots.txt missing/unreachable — fall through to the default location
  }
  if (sitemapCandidates.length === 0) {
    sitemapCandidates.push(`${origin}/sitemap.xml`);
  }

  const urls = new Set<string>();
  for (const sitemapUrl of sitemapCandidates.slice(0, 3)) {
    try {
      const xml = await fetchWithTimeout(sitemapUrl);
      for (const m of Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))) {
        urls.add(m[1]!);
      }
    } catch {
      // this candidate doesn't exist / isn't reachable — try the next one
    }
  }
  return Array.from(urls).slice(0, 50);
}

/**
 * Fetches a URL and returns structured page content.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html = "";
  try {
    html = await safeFetchText(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CompetitorAnalyzer/1.0; +https://manus.im)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de,en;q=0.9",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const baseUrl = resolveBaseUrl(url, $);

  const title = cleanText($("title").first().text()) || url;
  const metaDescription = cleanText($('meta[name="description"]').attr("content") ?? "");

  const headings: ScrapedHeading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1)) as ScrapedHeading["level"];
    const text = cleanText($(el).text());
    if (text) headings.push({ level, text });
  });
  const headlines = headings
    .filter((h) => h.level <= 3)
    .map((h) => h.text)
    .slice(0, 20);

  const paragraphs = $("p")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter((t) => t.length > 30)
    .slice(0, 15);

  const ctaTexts = Array.from(
    new Set(
      $("button, a[class*='btn'], a[class*='button'], a[class*='cta']")
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter((t) => t.length > 0 && t.length < 60)
    )
  ).slice(0, 10);

  const navItems = Array.from(
    new Set(
      $("nav a, header a")
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter((t) => t.length > 0 && t.length < 50)
    )
  ).slice(0, 10);

  const rawImages: ScrapedImage[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (!src) return;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(src, baseUrl).toString();
    } catch {
      return;
    }
    if (!absoluteUrl.startsWith("http")) return; // skips data:/blob: URIs etc.
    rawImages.push({
      url: absoluteUrl,
      alt: cleanText($(el).attr("alt") ?? ""),
      width: parseDimension($(el).attr("width")),
      height: parseDimension($(el).attr("height")),
    });
  });
  const images = dedupeImages(rawImages).slice(0, 30);

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(JSON.parse($(el).contents().text()));
    } catch {
      // malformed JSON-LD on the source page — skip it
    }
  });

  const seo: ScrapedSeoMeta = {
    canonical: $('link[rel="canonical"]').attr("href") ?? null,
    robots: $('meta[name="robots"]').attr("content") ?? null,
    ogTitle: $('meta[property="og:title"]').attr("content") ?? null,
    ogDescription: $('meta[property="og:description"]').attr("content") ?? null,
    ogImage: $('meta[property="og:image"]').attr("content") ?? null,
    twitterCard: $('meta[name="twitter:card"]').attr("content") ?? null,
    viewport: $('meta[name="viewport"]').attr("content") ?? null,
    lang: $("html").attr("lang") ?? null,
    jsonLd: jsonLd.slice(0, 10),
  };

  const sitemapUrls = await fetchSitemapUrls(baseUrl).catch(() => []);

  // Strip script/style/noscript before computing the plain-text body extract
  // (must happen after the JSON-LD pass above, which reads script tags).
  $("script, style, noscript").remove();
  const fullText = cleanText($("body").text()).slice(0, 8000);

  return {
    url,
    title,
    metaDescription,
    headlines,
    headings: headings.slice(0, 30),
    paragraphs,
    ctaTexts,
    navItems,
    images,
    seo,
    sitemapUrls,
    fullText,
  };
}

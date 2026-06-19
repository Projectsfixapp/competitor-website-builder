/**
 * Scraping Engine
 * Fetches competitor URLs server-side and extracts structured content.
 */

import { safeFetchText } from "./_core/ssrf";

export interface ScrapedPage {
  url: string;
  title: string;
  metaDescription: string;
  headlines: string[];
  paragraphs: string[];
  ctaTexts: string[];
  navItems: string[];
  fullText: string;
}

/**
 * Strips HTML tags and normalises whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts all occurrences of a regex pattern from HTML.
 */
function extractAll(html: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((match = re.exec(html)) !== null) {
    const text = stripHtml(match[1] ?? "").trim();
    if (text && text.length > 2 && text.length < 300) results.push(text);
  }
  return Array.from(new Set(results));
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

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]) : url;

  // Meta description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : "";

  // Headlines h1–h3
  const headlines = [
    ...extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    ...extractAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i),
    ...extractAll(html, /<h3[^>]*>([\s\S]*?)<\/h3>/i),
  ].slice(0, 20);

  // Paragraphs
  const paragraphs = extractAll(html, /<p[^>]*>([\s\S]*?)<\/p>/i)
    .filter((p) => p.length > 30)
    .slice(0, 15);

  // CTA buttons and links
  const ctaTexts = [
    ...extractAll(html, /<button[^>]*>([\s\S]*?)<\/button>/i),
    ...extractAll(html, /<a[^>]+class=["'][^"']*btn[^"']*["'][^>]*>([\s\S]*?)<\/a>/i),
    ...extractAll(html, /<a[^>]+class=["'][^"']*button[^"']*["'][^>]*>([\s\S]*?)<\/a>/i),
    ...extractAll(html, /<a[^>]+class=["'][^"']*cta[^"']*["'][^>]*>([\s\S]*?)<\/a>/i),
  ]
    .filter((t) => t.length < 60)
    .slice(0, 10);

  // Nav items
  const navItems = extractAll(html, /<(?:nav|header)[^>]*>([\s\S]*?)<\/(?:nav|header)>/i)
    .flatMap((nav) => extractAll(nav, /<a[^>]*>([\s\S]*?)<\/a>/i))
    .filter((t) => t.length < 50)
    .slice(0, 10);

  // Full text (truncated to 8000 chars for LLM)
  const fullText = stripHtml(html).slice(0, 8000);

  return {
    url,
    title,
    metaDescription,
    headlines,
    paragraphs,
    ctaTexts,
    navItems,
    fullText,
  };
}

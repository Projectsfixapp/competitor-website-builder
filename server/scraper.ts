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

export interface ScrapedLink {
  text: string;
  href: string;
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
  /** All same-origin links on the page (text + absolute href), used to locate About/Services/Impressum subpages. */
  links: ScrapedLink[];
  fullText: string;
  /** Up to 3 brand accent colors (hex), best-effort from theme-color meta + inline/`<style>` CSS. */
  brandColors: string[];
  /** Best-guess logo image URL (header/nav image, or alt text containing "logo"), or null if none found. */
  logoUrl: string | null;
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

const HEX_COLOR_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB_COLOR_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/gi;

function normalizeHex(hex: string): string | null {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || !/^[0-9a-f]{6}$/.test(h)) return null;
  return `#${h}`;
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Excludes near-white, near-black, and low-saturation greys — those are layout colors, not brand accents. */
function isVividColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return lightness > 0.08 && lightness < 0.92 && saturation > 0.18;
}

function cssColorToHex(value: string): string | null {
  const trimmed = value.trim();
  const direct = normalizeHex(trimmed);
  if (direct) return direct;
  const rgbMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
  if (rgbMatch) return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  return null;
}

/** Concatenates inline `style="..."` attributes and `<style>` block text — narrower and far less noisy than scanning raw HTML/JS for hex-like substrings. */
function collectStyleText($: cheerio.CheerioAPI): string {
  const parts: string[] = [];
  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    if (style) parts.push(style);
  });
  $("style").each((_, el) => {
    parts.push($(el).contents().text());
  });
  return parts.join(" ");
}

/**
 * Best-effort brand accent color detection: theme-color meta tag first (an
 * explicit, deliberate brand-color declaration when present), then the most
 * frequent vivid colors found in inline styles / <style> blocks. Cannot see
 * colors defined only in external stylesheets — that needs fetching and
 * parsing linked CSS files, deferred for now.
 */
function extractBrandColors($: cheerio.CheerioAPI): string[] {
  const ordered: string[] = [];
  const themeColor = $('meta[name="theme-color"]').attr("content");
  if (themeColor) {
    const hex = cssColorToHex(themeColor);
    if (hex) ordered.push(hex);
  }

  const styleText = collectStyleText($);
  const counts = new Map<string, number>();
  const record = (hex: string | null) => {
    if (!hex || !isVividColor(hex) || ordered.includes(hex)) return;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  for (const m of Array.from(styleText.matchAll(HEX_COLOR_RE))) {
    record(normalizeHex(m[0]));
  }
  for (const m of Array.from(styleText.matchAll(RGB_COLOR_RE))) {
    record(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  const byFrequency = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  return [...ordered, ...byFrequency].slice(0, 3);
}

/** Best-guess logo: an image inside header/nav/home-link, falling back to alt text containing "logo". */
function detectLogoUrl($: cheerio.CheerioAPI, baseUrl: string, images: ScrapedImage[]): string | null {
  let candidate: string | null = null;
  $("header img, nav img, a[href='/'] img, a[href='#'] img").each((_, el) => {
    if (candidate) return;
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (!src) return;
    try {
      candidate = new URL(src, baseUrl).toString();
    } catch {
      // invalid src — keep looking
    }
  });
  if (candidate) return candidate;
  return images.find((img) => /logo/i.test(img.alt))?.url ?? null;
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
        "User-Agent": "Mozilla/5.0 (compatible; CompetitorAnalyzer/1.0)",
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
  const brandColors = extractBrandColors($);
  const logoUrl = detectLogoUrl($, baseUrl, images);

  const seenLinks = new Set<string>();
  const links: ScrapedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (!absoluteUrl.startsWith("http") || seenLinks.has(absoluteUrl)) return;
    seenLinks.add(absoluteUrl);
    links.push({ text: cleanText($(el).text()), href: absoluteUrl });
  });

  // Strip script/style/noscript before computing the plain-text body extract
  // (must happen after the JSON-LD/brand-color/logo passes above, which read
  // script and style content).
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
    links: links.slice(0, 200),
    fullText,
    brandColors,
    logoUrl,
  };
}

// ─── Own-site content extraction ───────────────────────────────────────────────
// When the customer provides their own URL (separate from competitors), we
// scrape a few likely subpages too — About/Services/Impressum content rarely
// lives on the homepage — so the generated website can reuse real text
// instead of the LLM inventing an "Über uns" section from nothing.

export interface OwnSiteContent {
  title: string;
  logoUrl: string | null;
  brandColors: string[];
  aboutText: string | null;
  servicesText: string | null;
  contactInfo: Record<string, string> | null;
}

const MAX_OWN_SITE_SUBPAGES = 4;
const ABOUT_KEYWORDS = ["über uns", "ueber-uns", "about", "wer wir sind", "unternehmen", "team"];
const SERVICES_KEYWORDS = ["leistungen", "services", "angebot", "produkte", "portfolio"];
const CONTACT_KEYWORDS = ["impressum", "kontakt", "contact", "imprint"];

function matchesKeyword(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((kw) => normalized.includes(kw));
}

/** Finds the best-matching same-origin subpage URL for a content category, preferring link text over raw path. */
function findSubpageUrl(page: ScrapedPage, origin: string, keywords: string[]): string | null {
  const candidates = page.links.filter((link) => {
    try {
      return new URL(link.href).origin === origin;
    } catch {
      return false;
    }
  });
  const byText = candidates.find((link) => matchesKeyword(link.text, keywords));
  if (byText) return byText.href;
  const byPath = candidates.find((link) => {
    try {
      return matchesKeyword(decodeURIComponent(new URL(link.href).pathname), keywords);
    } catch {
      return false;
    }
  });
  return byPath?.href ?? null;
}

function extractJsonLdOrganization(page: ScrapedPage): Record<string, unknown> | null {
  for (const entry of page.seo.jsonLd) {
    if (!entry || typeof entry !== "object") continue;
    const type = (entry as Record<string, unknown>)["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && /organization|localbusiness/i.test(t))) {
      return entry as Record<string, unknown>;
    }
  }
  return null;
}

function formatAddress(address: unknown): string | null {
  if (typeof address === "string") return address;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const parts = [a.streetAddress, a.postalCode, a.addressLocality, a.addressCountry]
      .filter((p) => typeof p === "string" && p.length > 0);
    if (parts.length > 0) return parts.join(", ");
  }
  return null;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d /().-]{7,}\d)/;

function extractContactInfo(page: ScrapedPage): Record<string, string> | null {
  const org = extractJsonLdOrganization(page);
  const info: Record<string, string> = {};
  if (org) {
    if (typeof org.name === "string") info.name = org.name;
    if (typeof org.telephone === "string") info.phone = org.telephone;
    if (typeof org.email === "string") info.email = org.email;
    const address = formatAddress(org.address);
    if (address) info.address = address;
  }
  if (!info.email) {
    const email = EMAIL_RE.exec(page.fullText)?.[0];
    if (email) info.email = email;
  }
  if (!info.phone) {
    const phone = PHONE_RE.exec(page.fullText)?.[0]?.trim();
    if (phone) info.phone = phone;
  }
  return Object.keys(info).length > 0 ? info : null;
}

/** Picks the longest, most substantial paragraphs as a stand-in for a page's "real content". */
function summarizeParagraphs(page: ScrapedPage, maxChars = 1200): string | null {
  if (page.paragraphs.length === 0) return null;
  const text = page.paragraphs.join(" ").slice(0, maxChars);
  return text.length > 0 ? text : null;
}

export async function scrapeOwnSite(url: string): Promise<OwnSiteContent> {
  const home = await scrapePage(url);
  let origin: string;
  try {
    origin = new URL(home.url).origin;
  } catch {
    origin = url;
  }

  const aboutUrl = findSubpageUrl(home, origin, ABOUT_KEYWORDS);
  const servicesUrl = findSubpageUrl(home, origin, SERVICES_KEYWORDS);
  const contactUrl = findSubpageUrl(home, origin, CONTACT_KEYWORDS);

  const subpageUrls = Array.from(new Set([aboutUrl, servicesUrl, contactUrl].filter((u): u is string => !!u))).slice(
    0,
    MAX_OWN_SITE_SUBPAGES
  );

  const subpages = new Map<string, ScrapedPage>();
  for (const subUrl of subpageUrls) {
    try {
      subpages.set(subUrl, await scrapePage(subUrl));
    } catch (err) {
      console.warn(`[OwnSite] Konnte Unterseite nicht laden: ${subUrl}`, err);
    }
  }

  const aboutPage = (aboutUrl && subpages.get(aboutUrl)) || home;
  const servicesPage = (servicesUrl && subpages.get(servicesUrl)) || null;
  const contactPage = (contactUrl && subpages.get(contactUrl)) || home;

  return {
    title: home.title,
    logoUrl: home.logoUrl,
    brandColors: home.brandColors,
    aboutText: summarizeParagraphs(aboutPage),
    servicesText: servicesPage ? summarizeParagraphs(servicesPage) : null,
    contactInfo: extractContactInfo(contactPage),
  };
}

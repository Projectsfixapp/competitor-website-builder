/**
 * LLM Analysis Pipeline
 * Extracts insights from scraped pages and generates a superior website.
 */

import JSON5 from "json5";
import { DEFAULT_ACCENT_COLORS, DEFAULT_BACKGROUND_HEX } from "@shared/const";
import { generateImageWithGemini } from "./geminiImages";
import { callLLM, type LLMProvider } from "./llmAdapter";
import type { ScrapedImage, ScrapedPage } from "./scraper";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeoSignals {
  hasMetaDescription: boolean;
  hasCanonical: boolean;
  hasOpenGraph: boolean;
  hasJsonLd: boolean;
  hasSitemap: boolean;
  h1Count: number;
  imageAltCoverage: number;
  totalImages: number;
}

export interface StructureSignals {
  hasNav: boolean;
  headingLevelsUsed: number;
  paragraphCount: number;
  ctaCount: number;
}

export interface CompetitorScoreBreakdown {
  content: number;
  seo: number;
  structure: number;
  conversion: number;
}

export interface CompetitorScore {
  url: string;
  title: string;
  rank: number;
  overallScore: number;
  breakdown: CompetitorScoreBreakdown;
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CompetitorInsights {
  usps: string[];
  keywords: string[];
  toneOfVoice: string;
  structurePatterns: string[];
  ctaPatterns: string[];
  targetAudience: string;
  competitorSummaries: Array<{
    url: string;
    title: string;
    summary: string;
    usps: string[];
  }>;
  scores: CompetitorScore[];
}

export interface GeneratedWebsiteData {
  htmlContent: string;
  configJson: Record<string, unknown>;
}

// ─── Deterministic scoring (from real scraped signals, not LLM guesswork) ─────

function clampScore(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

export function computeSeoSignals(page: ScrapedPage): SeoSignals {
  const h1Count = page.headings.filter((h) => h.level === 1).length;
  const totalImages = page.images.length;
  const imagesWithAlt = page.images.filter((img) => img.alt.length > 0).length;
  return {
    hasMetaDescription: page.metaDescription.length > 0,
    hasCanonical: Boolean(page.seo.canonical),
    hasOpenGraph: Boolean(page.seo.ogTitle || page.seo.ogDescription || page.seo.ogImage),
    hasJsonLd: page.seo.jsonLd.length > 0,
    hasSitemap: page.sitemapUrls.length > 0,
    h1Count,
    imageAltCoverage: totalImages > 0 ? imagesWithAlt / totalImages : 1,
    totalImages,
  };
}

/** Weights sum to 10: every point is tied to a checkable fact, not a vibe. */
export function scoreSeoSignals(signals: SeoSignals): number {
  let score = 0;
  if (signals.hasMetaDescription) score += 2;
  if (signals.hasCanonical) score += 1;
  if (signals.hasOpenGraph) score += 1.5;
  if (signals.hasJsonLd) score += 1.5;
  if (signals.hasSitemap) score += 1;
  if (signals.h1Count === 1) score += 1.5;
  else if (signals.h1Count > 1) score += 0.5; // multiple H1s: minor smell, still some credit
  score += signals.imageAltCoverage * 1.5;
  return clampScore(score);
}

export function computeStructureSignals(page: ScrapedPage): StructureSignals {
  return {
    hasNav: page.navItems.length > 0,
    headingLevelsUsed: new Set(page.headings.map((h) => h.level)).size,
    paragraphCount: page.paragraphs.length,
    ctaCount: page.ctaTexts.length,
  };
}

/** Weights sum to 10. Judges page organization, not visual design (not derivable from text/HTML alone). */
export function scoreStructureSignals(signals: StructureSignals): number {
  let score = 0;
  if (signals.hasNav) score += 2.5;
  score += Math.min(signals.headingLevelsUsed, 3) * 1.2;
  score += Math.min(signals.paragraphCount / 15, 1) * 2.4;
  if (signals.ctaCount > 0) score += 1.5;
  return clampScore(score);
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

interface LlmCompetitorJudgement {
  index: number;
  contentScore?: number;
  conversionScore?: number;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
}

/**
 * Calls the LLM and parses its response as JSON, retrying once with a
 * stronger instruction if the first attempt isn't valid JSON. Throws instead
 * of silently falling back to {} — a silently "successful" empty analysis is
 * worse than a clearly failed one that the SSE error handler can surface.
 */
async function callLLMForJson(
  buildOpts: (attempt: number) => Parameters<typeof callLLM>[0],
  maxAttempts = 2
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await callLLM(buildOpts(attempt));
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      lastError = err;
      console.error(`[Pipeline] JSON-Parse-Fehler (Versuch ${attempt}/${maxAttempts}):`, raw.slice(0, 200));
    }
  }
  throw new Error(
    `Die KI-Antwort konnte nach ${maxAttempts} Versuchen nicht als valides JSON gelesen werden: ${String(lastError)}`
  );
}

export async function analyzeCompetitors(pages: ScrapedPage[], provider: LLMProvider = "manus"): Promise<CompetitorInsights> {
  const pagesText = pages
    .map((p, i) => {
      const seo = computeSeoSignals(p);
      return `
--- MITBEWERBER ${i + 1}: ${p.url} ---
Titel: ${p.title}
Meta-Description: ${p.metaDescription}
Headlines: ${p.headlines.join(" | ")}
CTAs: ${p.ctaTexts.join(" | ")}
Paragraphen (Auszug): ${p.paragraphs.slice(0, 5).join(" | ")}
Bilder: ${seo.totalImages} gefunden, ${Math.round(seo.imageAltCoverage * 100)}% mit Alt-Text
SEO-Signale (automatisch ermittelt): Meta-Description ${seo.hasMetaDescription ? "ja" : "nein"}, Canonical ${seo.hasCanonical ? "ja" : "nein"}, Open Graph ${seo.hasOpenGraph ? "ja" : "nein"}, strukturierte Daten ${seo.hasJsonLd ? "ja" : "nein"}, Sitemap ${seo.hasSitemap ? "ja" : "nein"}, H1-Anzahl ${seo.h1Count}
Volltext (Auszug): ${p.fullText.slice(0, 2000)}
`;
    })
    .join("\n");

  const systemPrompt = `Du bist ein Elite-Stratege für digitales Marketing und Conversion-Optimierung.
Analysiere die Mitbewerber-Websites und extrahiere strukturierte Insights sowie eine vergleichende Bewertung.
Antworte AUSSCHLIESSLICH mit validem JSON – kein Markdown, keine Erklärungen.`;

  const userPrompt = `Analysiere diese ${pages.length} Mitbewerber-Websites und vergleiche sie direkt miteinander:

${pagesText}

Gib folgendes JSON zurück:
{
  "usps": ["USP 1", "USP 2", ...],
  "keywords": ["keyword1", ...],
  "toneOfVoice": "Beschreibung des Kommunikationsstils",
  "structurePatterns": ["Muster 1", ...],
  "ctaPatterns": ["CTA 1", ...],
  "targetAudience": "Beschreibung der Zielgruppe",
  "competitorSummaries": [
    { "url": "https://...", "title": "Seitentitel", "summary": "Kurze Zusammenfassung der Positionierung", "usps": ["USP 1", "USP 2", "USP 3"] }
  ],
  "competitorScores": [
    {
      "index": 1,
      "contentScore": 7,
      "conversionScore": 6,
      "summary": "Ein bis zwei Sätze, für absolute Laien verständlich, zur Gesamteinschätzung dieser Seite im Vergleich zu den anderen.",
      "strengths": ["Stärke 1", "Stärke 2"],
      "weaknesses": ["Schwäche 1", "Schwäche 2"]
    }
  ]
}

Wichtig für competitorScores:
- "index" entspricht der MITBEWERBER-Nummer oben (1, 2, 3, ...) – für JEDEN Mitbewerber genau ein Eintrag
- contentScore (1-10): Qualität/Überzeugungskraft der Texte und USPs im Vergleich zu den ANDEREN Mitbewerbern
- conversionScore (1-10): Klarheit und Wirksamkeit der CTAs im Vergleich zu den ANDEREN Mitbewerbern
- Bewerte relativ zueinander, nicht absolut – bei nur einem Mitbewerber ist 7 ein neutraler Standardwert`;

  const parsed = await callLLMForJson((attempt) => ({
    provider,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          attempt === 1
            ? userPrompt
            : `${userPrompt}\n\nWICHTIG: Deine vorherige Antwort war kein valides JSON. Antworte dieses Mal AUSSCHLIESSLICH mit einem einzigen validen JSON-Objekt, ohne Markdown-Codeblock, ohne Kommentare.`,
      },
    ],
  }));

  const usps = Array.isArray(parsed.usps) ? (parsed.usps as string[]) : [];
  const keywords = Array.isArray(parsed.keywords) ? (parsed.keywords as string[]) : [];
  const toneOfVoice = typeof parsed.toneOfVoice === "string" ? parsed.toneOfVoice : "Professionell";
  const structurePatterns = Array.isArray(parsed.structurePatterns) ? (parsed.structurePatterns as string[]) : [];
  const ctaPatterns = Array.isArray(parsed.ctaPatterns) ? (parsed.ctaPatterns as string[]) : [];
  const targetAudience = typeof parsed.targetAudience === "string" ? parsed.targetAudience : "Allgemein";
  const competitorSummaries = Array.isArray(parsed.competitorSummaries)
    ? (parsed.competitorSummaries as CompetitorInsights["competitorSummaries"])
    : [];

  const judgements = Array.isArray(parsed.competitorScores)
    ? (parsed.competitorScores as LlmCompetitorJudgement[])
    : [];
  const judgementByIndex = new Map(judgements.map((j) => [j.index, j]));

  const unranked = pages.map((page, i) => {
    const judgement = judgementByIndex.get(i + 1);
    if (!judgement) {
      console.warn(
        `[Pipeline] Keine KI-Bewertung für Mitbewerber ${i + 1} (${page.url}) erhalten, neutrale Standard-Scores verwendet.`
      );
    }
    const breakdown: CompetitorScoreBreakdown = {
      content: clampScore(judgement?.contentScore ?? 5),
      seo: scoreSeoSignals(computeSeoSignals(page)),
      structure: scoreStructureSignals(computeStructureSignals(page)),
      conversion: clampScore(judgement?.conversionScore ?? 5),
    };
    const overallScore = clampScore(
      (breakdown.content + breakdown.seo + breakdown.structure + breakdown.conversion) / 4
    );
    return {
      url: page.url,
      title: page.title,
      overallScore,
      breakdown,
      summary: judgement?.summary ?? "Keine detaillierte Einschätzung verfügbar.",
      strengths: judgement?.strengths ?? [],
      weaknesses: judgement?.weaknesses ?? [],
    };
  });

  const scores: CompetitorScore[] = unranked
    .slice()
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return {
    usps,
    keywords,
    toneOfVoice,
    structurePatterns,
    ctaPatterns,
    targetAudience,
    competitorSummaries,
    scores,
  };
}

// ─── Theme resolution ─────────────────────────────────────────────────────────

export interface ResolvedTheme {
  backgroundColor: string;
  accentColors: string[];
  logoUrl: string | null;
  /** Real, already-existing image URLs usable as content photos (excludes the logo). */
  images: string[];
}

interface ProjectThemeConfig {
  colorMode: "manual" | "extract";
  backgroundColor: string | null;
  accentColors: string[] | null;
}

const MIN_USABLE_IMAGE_DIMENSION = 150;
const MAX_USABLE_IMAGES = 12;

function isLikelyContentImage(img: ScrapedImage, excludeUrl: string | null): boolean {
  if (excludeUrl && img.url === excludeUrl) return false; // exclude the logo itself
  if (img.width !== null && img.width < MIN_USABLE_IMAGE_DIMENSION) return false;
  if (img.height !== null && img.height < MIN_USABLE_IMAGE_DIMENSION) return false;
  return true;
}

/**
 * Real image URLs to offer the website generator, own-site images first
 * (most relevant — these are literally the customer's own photos), then
 * competitor images, deduped, excluding the logo and obvious icon-sized images.
 */
export function collectUsableImages(
  pages: ScrapedPage[],
  ownSiteUrl: string | null,
  logoUrl: string | null,
  limit = MAX_USABLE_IMAGES
): string[] {
  const ownPage = ownSiteUrl ? pages.find((p) => p.url === ownSiteUrl) : undefined;
  const orderedPages = ownPage ? [ownPage, ...pages.filter((p) => p !== ownPage)] : pages;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const page of orderedPages) {
    for (const img of page.images) {
      if (result.length >= limit) return result;
      if (seen.has(img.url) || !isLikelyContentImage(img, logoUrl)) continue;
      seen.add(img.url);
      result.push(img.url);
    }
  }
  return result;
}

/**
 * Logo always comes from the page marked as the customer's own site, if any
 * — that's a near-mandatory "use the real logo" requirement, independent of
 * how colors are chosen. Colors follow colorMode: "extract" uses the own
 * site's detected brand colors (falling back to the manual/default palette
 * if extraction found nothing usable); "manual" uses the project's stored
 * choice. Content images are always real scraped photos when any exist —
 * AI-generated fallback images (see generateWebsite) only kick in when this
 * list comes back empty.
 */
export function resolveTheme(
  project: ProjectThemeConfig,
  scrapedPages: ScrapedPage[],
  ownSiteUrl: string | null
): ResolvedTheme {
  const ownPage = ownSiteUrl ? scrapedPages.find((p) => p.url === ownSiteUrl) ?? null : null;
  const logoUrl = ownPage?.logoUrl ?? null;
  const images = collectUsableImages(scrapedPages, ownSiteUrl, logoUrl);

  if (project.colorMode === "extract" && ownPage && ownPage.brandColors.length > 0) {
    return { backgroundColor: DEFAULT_BACKGROUND_HEX, accentColors: ownPage.brandColors, logoUrl, images };
  }
  return {
    backgroundColor: project.backgroundColor ?? DEFAULT_BACKGROUND_HEX,
    accentColors: project.accentColors?.length ? project.accentColors : DEFAULT_ACCENT_COLORS,
    logoUrl,
    images,
  };
}

const FALLBACK_IMAGE_PROMPTS = [
  (context: string, tone: string) =>
    `Professionelles, hochwertiges Hero-Foto für die Website von "${context}". Stil/Tonalität: ${tone}. Fotorealistisch, helle freundliche Stimmung, keine Texte oder Logos im Bild.`,
  (context: string, tone: string) =>
    `Professionelles Foto, das die Arbeit/Dienstleistung von "${context}" zeigt. Stil/Tonalität: ${tone}. Fotorealistisch, helle Stimmung, keine Texte im Bild.`,
];

/**
 * AI-generates a couple of stand-in photos via Gemini when no real images
 * were found at all (e.g. no own site marked/provided). Best-effort: a
 * missing/invalid GEMINI_API_KEY or an API failure just yields fewer (or
 * zero) images rather than failing the whole website generation — the
 * generator prompt is instructed to fall back to a photo-free, CSS-only
 * design when the image list comes back empty.
 */
async function generateFallbackImages(context: string, tone: string): Promise<string[]> {
  const images: string[] = [];
  for (const buildPrompt of FALLBACK_IMAGE_PROMPTS) {
    try {
      const { dataUrl } = await generateImageWithGemini(buildPrompt(context, tone));
      images.push(dataUrl);
    } catch (err) {
      console.warn("[Pipeline] KI-Bild-Fallback fehlgeschlagen, fahre ohne dieses Bild fort:", err);
    }
  }
  return images;
}

// ─── Website Generator ────────────────────────────────────────────────────────

export async function generateWebsite(
  insights: CompetitorInsights,
  pages: ScrapedPage[],
  provider: LLMProvider = "manus",
  theme: ResolvedTheme = { backgroundColor: DEFAULT_BACKGROUND_HEX, accentColors: DEFAULT_ACCENT_COLORS, logoUrl: null, images: [] }
): Promise<GeneratedWebsiteData> {
  const context = pages[0]?.title ?? insights.targetAudience;
  const availableImages =
    theme.images.length > 0 ? theme.images : await generateFallbackImages(context, insights.toneOfVoice);
  const rankingSummary = insights.scores
    .map(
      (s) =>
        `Platz ${s.rank} (Score ${s.overallScore}/10): ${s.title} – Stärken: ${s.strengths.join(", ") || "–"}; Schwächen: ${s.weaknesses.join(", ") || "–"}`
    )
    .join("\n");

  const insightsSummary = `
USPs der Mitbewerber: ${insights.usps.join(", ")}
Keywords: ${insights.keywords.join(", ")}
Tonalität: ${insights.toneOfVoice}
Zielgruppe: ${insights.targetAudience}
Struktur-Muster: ${insights.structurePatterns.join(", ")}
CTA-Muster: ${insights.ctaPatterns.join(", ")}
Branche/Kontext: ${context}
Wettbewerbs-Ranking:
${rankingSummary}
`;

  const accentColorsText = theme.accentColors.join(", ");
  const logoRule = theme.logoUrl
    ? `\n- Logo: Verwende GENAU diese Bild-URL im Header/in der Navigation (das echte Logo des Kunden, nicht neu erfinden): ${theme.logoUrl}`
    : "";
  const imageRule =
    availableImages.length > 0
      ? `- Bilder: Verwende AUSSCHLIESSLICH diese ${availableImages.length} echten Bild-URLs für inhaltliche Fotos (Hero, Galerie, Team etc.) — erfinde KEINE eigenen Bild-URLs (auch keine Unsplash-Links, diese existieren nicht und führen zu kaputten Bildern):\n  ${availableImages.join("\n  ")}`
      : "- Bilder: Es liegen keine echten Fotos vor — verwende stattdessen bewusst Farbflächen, Verläufe in den Akzentfarben und Inline-SVG-Illustrationen statt Fotos. Erfinde KEINE Bild-URLs (auch keine Unsplash-Links), diese wären kaputt.";

  const htmlContent_raw = await callLLM({
    provider,
    responseFormat: "text",
    messages: [
      {
        role: "system",
        content: `Du bist ein preisgekrönter Full-Stack-Entwickler und UI/UX-Designer.
Du erstellst hochkonvertierende, technisch perfekte Websites als vollständiges HTML/CSS/JS-Dokument.

DESIGN-REGELN (ABSOLUT VERBINDLICH):
- Ausschließlich Light Mode: ${theme.backgroundColor} Hintergrund, nie Dark Mode
- Schriftarten: Inter für Body, Playfair Display für Headlines (via Google Fonts CDN)
- Farben: Primär #1A1A1A (fast schwarz), Akzent(e) ${accentColorsText}, Hintergrund ${theme.backgroundColor}
- Großzügiges Whitespace: padding min. 80px vertikal, max-width 1200px zentriert
- Keine KI-Klischees: keine Neon-Effekte, keine generischen Verläufe
- Wirkt wie von einer High-End-Webagentur gestaltet
${imageRule}
- Icons: Inline-SVG oder Unicode-Symbole${logoRule}

TECHNISCHE ANFORDERUNGEN:
- Vollständiges, valides HTML5-Dokument (<!DOCTYPE html> bis </html>)
- Inline CSS im <style>-Tag, kein externes CSS
- Vanilla JS im <script>-Tag für Interaktivität
- Mobile-First, responsive mit CSS Grid/Flexbox
- contenteditable="true" auf ALLEN Textelementen (Headlines, Paragraphen, Button-Texte)
- Zentrales CONFIG-Objekt am Anfang des <script>-Tags mit allen Texten und URLs
- Klare HTML-Kommentare: <!-- HERO SECTION START --> etc.
- Smooth Scroll, Sticky Nav, Hover-Effekte
- FAQ-Akkordeon mit JS
- Alle Buttons und Links klickbar (href="#section")

SEITENSTRUKTUR (PFLICHT):
1. Sticky Navigation mit Logo + Links + CTA-Button
2. Hero Section: Großer Headline, Subheadline, 2 CTAs, Hintergrundbild
3. Social Proof: Logos oder Zahlen (3 Stat-Boxen)
4. Features/Benefits: 3-Spalten-Grid mit Icons und Texten
5. Über uns / Warum wir: Asymmetrisches Layout mit Bild
6. Testimonials: 3 Karten
7. FAQ: Akkordeon mit 4 Fragen
8. CTA-Banner: Volle Breite, Kontrastfarbe
9. Footer: Links, Kontakt, Copyright`,
      },
      {
        role: "user",
        content: `Erstelle eine überlegene, hochkonvertierende Website basierend auf dieser Mitbewerber-Analyse:

${insightsSummary}

Wichtig:
- Übernimm die besten Elemente aller Mitbewerber und mache sie BESSER
- Übertriff besonders den Erstplatzierten im Ranking, und vermeide die genannten Schwächen aller Mitbewerber
- Schreibe völlig neue, einzigartige Copy (kein Copy-Paste)
- Optimiere für SEO und Conversion
- Alle Texte müssen contenteditable="true" haben
- Gib NUR das vollständige HTML-Dokument zurück, ohne Markdown-Wrapper`,
      },
    ],
  });

  let htmlContent = htmlContent_raw;

  // Validierung: Muss ein vollständiges HTML-Dokument sein
  if (!htmlContent.includes("<!DOCTYPE") && !htmlContent.includes("<html")) {
    console.error("[Pipeline] Generated content is not valid HTML, wrapping");
    htmlContent = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Generierte Website</title></head><body>${htmlContent}</body></html>`;
  }

  const configJson = extractConfigJson(htmlContent);

  return { htmlContent, configJson };
}

/**
 * Pulls the `const CONFIG = {...}` object literal out of generated HTML.
 * Uses JSON5 (tolerates unquoted keys, single quotes, trailing commas) instead
 * of `new Function()`/`eval` — the matched text flows from LLM output, which
 * is itself influenced by scraped competitor content and (later) chat prompts,
 * so it must never be executed as code.
 */
export function extractConfigJson(html: string): Record<string, unknown> {
  const configMatch = html.match(/const\s+CONFIG\s*=\s*(\{[\s\S]*?\});/);
  if (!configMatch) return {};
  try {
    return JSON5.parse(configMatch[1]!) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Chat-Based Revisions ───────────────────────────────────────────────────────

const REVISION_DELIMITER = "---HTML---";
const UPLOADED_IMAGE_TOKEN = "__UPLOADED_IMAGE__";
export const MAX_ATTACHED_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024; // ~6MB binary as base64

export interface AttachedImage {
  dataUrl: string;
  mimeType: string;
}

export interface ChatRevisionResult {
  reply: string;
  htmlContent: string;
  configJson: Record<string, unknown>;
}

export function validateAttachedImage(image: AttachedImage): void {
  if (!image.mimeType.startsWith("image/")) {
    throw new Error("Nur Bilddateien können hochgeladen werden.");
  }
  if (!image.dataUrl.startsWith("data:image/")) {
    throw new Error("Ungültiges Bildformat.");
  }
  if (image.dataUrl.length > MAX_ATTACHED_IMAGE_DATA_URL_LENGTH) {
    throw new Error("Das Bild ist zu groß (max. ca. 6 MB).");
  }
}

/**
 * Applies a natural-language change request to an existing generated website.
 * Asks the LLM to return the full updated HTML (not a diff/patch) — simpler
 * and more reliable than patch application, and consistent with how the
 * initial generateWebsite() output is produced and stored.
 *
 * An uploaded image is never sent to the LLM as a giant inline base64 string
 * (wasteful, and LLMs reliably mangle/truncate very long literal strings) —
 * the LLM is told to reference a short placeholder token instead, which is
 * substituted with the real data URL server-side afterwards.
 *
 * Security note: this output is only ever rendered through the sandboxed
 * editor iframe (ProjectPreview.tsx, sandbox="allow-same-origin" without
 * allow-scripts) — that output isolation is the actual defense against a
 * malicious change request ("add this tracking script"), not anything this
 * prompt says. No prompt wording reliably stops that; trying to filter it
 * here would be solving it at the wrong layer.
 */
export async function reviseWebsiteViaChat(
  currentHtml: string,
  message: string,
  provider: LLMProvider = "manus",
  attachedImage: AttachedImage | null = null
): Promise<ChatRevisionResult> {
  const imageInstruction = attachedImage
    ? `\n\nDer Nutzer hat ein Bild hochgeladen. Verwende GENAU diesen Platzhalter-String als img-src (oder background-image-URL) an der Stelle, die der Nutzer meint — ersetze ihn NICHT durch eine andere URL, er wird automatisch durch das echte Bild ersetzt: ${UPLOADED_IMAGE_TOKEN}`
    : "";

  const raw = await callLLM({
    provider,
    responseFormat: "text",
    messages: [
      {
        role: "system",
        content: `Du bearbeitest eine bestehende, von dir generierte Website anhand eines Änderungswunsches des Nutzers.

REGELN:
- Ändere NUR das, was der Nutzer angefordert hat. Struktur, Texte, Bilder und das CONFIG-Objekt bleiben unverändert, wo nicht explizit anders gewünscht.
- contenteditable="true" auf Textelementen bleibt erhalten.
- Erfinde KEINE neuen Bild-URLs (auch keine Unsplash-Links) — nutze nur bereits im HTML vorhandene Bild-URLs oder den Upload-Platzhalter.
- Gib deine Antwort in GENAU diesem Format zurück, sonst nichts:
REPLY: <ein kurzer, freundlicher Satz auf Deutsch, was du geändert hast>
${REVISION_DELIMITER}
<das vollständige, aktualisierte HTML-Dokument>`,
      },
      {
        role: "user",
        content: `Aktuelles HTML:\n\n${currentHtml}\n\nÄnderungswunsch: ${message}${imageInstruction}`,
      },
    ],
  });

  const delimiterIndex = raw.indexOf(REVISION_DELIMITER);
  let reply: string;
  let htmlContent: string;
  if (delimiterIndex === -1) {
    reply = "Änderung übernommen.";
    htmlContent = raw;
  } else {
    reply = raw.slice(0, delimiterIndex).replace(/^REPLY:\s*/i, "").trim() || "Änderung übernommen.";
    htmlContent = raw.slice(delimiterIndex + REVISION_DELIMITER.length).trim();
  }

  if (!htmlContent.includes("<!DOCTYPE") && !htmlContent.includes("<html")) {
    // Malformed output — keep the working previous version rather than store broken HTML.
    htmlContent = currentHtml;
    reply = "Die Änderung konnte nicht sauber angewendet werden. Bitte versuche es mit einer anderen Formulierung.";
  } else if (attachedImage) {
    htmlContent = htmlContent.split(UPLOADED_IMAGE_TOKEN).join(attachedImage.dataUrl);
  }

  return { reply, htmlContent, configJson: extractConfigJson(htmlContent) };
}

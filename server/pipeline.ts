/**
 * LLM Analysis Pipeline
 * Extracts insights from scraped pages and generates a superior website.
 */

import JSON5 from "json5";
import { callLLM, type LLMProvider } from "./llmAdapter";
import type { ScrapedPage } from "./scraper";

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

export interface GeneratedWebsiteData {
  htmlContent: string;
  configJson: Record<string, unknown>;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export async function analyzeCompetitors(pages: ScrapedPage[], provider: LLMProvider = "manus"): Promise<CompetitorInsights> {
  const pagesText = pages
    .map(
      (p, i) => `
--- MITBEWERBER ${i + 1}: ${p.url} ---
Titel: ${p.title}
Meta-Description: ${p.metaDescription}
Headlines: ${p.headlines.join(" | ")}
CTAs: ${p.ctaTexts.join(" | ")}
Paragraphen (Auszug): ${p.paragraphs.slice(0, 5).join(" | ")}
Volltext (Auszug): ${p.fullText.slice(0, 2000)}
`
    )
    .join("\n");

  const raw = await callLLM({
    provider,
    responseFormat: "json",
    messages: [
      {
        role: "system",
        content: `Du bist ein Elite-Stratege für digitales Marketing und Conversion-Optimierung.
Analysiere die Mitbewerber-Websites und extrahiere strukturierte Insights.
Antworte AUSSCHLIESSLICH mit validem JSON – kein Markdown, keine Erklärungen.`,
      },
      {
        role: "user",
        content: `Analysiere diese Mitbewerber-Websites und extrahiere:

${pagesText}

Gib folgendes JSON zurück:
{
  "usps": ["USP 1", "USP 2", ...],  // 5-10 einzigartige Verkaufsargumente aus ALLEN Mitbewerbern
  "keywords": ["keyword1", ...],     // 10-15 wichtigste SEO-Keywords
  "toneOfVoice": "Beschreibung des Kommunikationsstils",
  "structurePatterns": ["Muster 1", ...],  // Seitenstruktur-Muster (z.B. "Hero mit Video", "3-Spalten-Features")
  "ctaPatterns": ["CTA 1", ...],     // Effektive CTA-Formulierungen
  "targetAudience": "Beschreibung der Zielgruppe",
  "competitorSummaries": [
    {
      "url": "https://...",
      "title": "Seitentitel",
      "summary": "Kurze Zusammenfassung der Positionierung",
      "usps": ["USP 1", "USP 2", "USP 3"]
    }
  ]
}`,
      },
    ],
  });

  const jsonStr = raw;

  let parsed: Partial<CompetitorInsights>;
  try {
    parsed = JSON.parse(jsonStr) as Partial<CompetitorInsights>;
  } catch {
    console.error("[Pipeline] JSON parse error, using fallback", jsonStr.slice(0, 200));
    parsed = {};
  }

  // Fallback-Werte für fehlende Felder
  return {
    usps: parsed.usps ?? [],
    keywords: parsed.keywords ?? [],
    toneOfVoice: parsed.toneOfVoice ?? "Professionell",
    structurePatterns: parsed.structurePatterns ?? [],
    ctaPatterns: parsed.ctaPatterns ?? [],
    targetAudience: parsed.targetAudience ?? "Allgemein",
    competitorSummaries: parsed.competitorSummaries ?? [],
  };
}

// ─── Website Generator ────────────────────────────────────────────────────────

export async function generateWebsite(
  insights: CompetitorInsights,
  pages: ScrapedPage[],
  provider: LLMProvider = "manus"
): Promise<GeneratedWebsiteData> {
  const insightsSummary = `
USPs der Mitbewerber: ${insights.usps.join(", ")}
Keywords: ${insights.keywords.join(", ")}
Tonalität: ${insights.toneOfVoice}
Zielgruppe: ${insights.targetAudience}
Struktur-Muster: ${insights.structurePatterns.join(", ")}
CTA-Muster: ${insights.ctaPatterns.join(", ")}
Branche/Kontext: ${pages[0]?.title ?? "Unbekannt"}
`;

  const htmlContent_raw = await callLLM({
    provider,
    responseFormat: "text",
    messages: [
      {
        role: "system",
        content: `Du bist ein preisgekrönter Full-Stack-Entwickler und UI/UX-Designer.
Du erstellst hochkonvertierende, technisch perfekte Websites als vollständiges HTML/CSS/JS-Dokument.

DESIGN-REGELN (ABSOLUT VERBINDLICH):
- Ausschließlich Light Mode: Off-White (#FAFAF9) Hintergrund, nie Dark Mode
- Schriftarten: Inter für Body, Playfair Display für Headlines (via Google Fonts CDN)
- Farben: Primär #1A1A1A (fast schwarz), Akzent #C8A96E (warmes Gold), Hintergrund #FAFAF9
- Großzügiges Whitespace: padding min. 80px vertikal, max-width 1200px zentriert
- Keine KI-Klischees: keine Neon-Effekte, keine generischen Verläufe
- Wirkt wie von einer High-End-Webagentur gestaltet
- Bilder: Unsplash-URLs mit passenden Suchbegriffen (https://images.unsplash.com/photo-...)
- Icons: Inline-SVG oder Unicode-Symbole

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

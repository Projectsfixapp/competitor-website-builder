/**
 * LLM Analysis Pipeline
 * Extracts insights from scraped pages and generates a superior website.
 */

import { invokeLLM } from "./_core/llm";
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

export async function analyzeCompetitors(pages: ScrapedPage[]): Promise<CompetitorInsights> {
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

  const response = await invokeLLM({
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
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "competitor_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            usps: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
            toneOfVoice: { type: "string" },
            structurePatterns: { type: "array", items: { type: "string" } },
            ctaPatterns: { type: "array", items: { type: "string" } },
            targetAudience: { type: "string" },
            competitorSummaries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                  summary: { type: "string" },
                  usps: { type: "array", items: { type: "string" } },
                },
                required: ["url", "title", "summary", "usps"],
                additionalProperties: false,
              },
            },
          },
          required: [
            "usps",
            "keywords",
            "toneOfVoice",
            "structurePatterns",
            "ctaPatterns",
            "targetAudience",
            "competitorSummaries",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : "{}";

  // Robuste JSON-Extraktion: Markdown-Wrapper entfernen falls vorhanden
  const jsonStr = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

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
  pages: ScrapedPage[]
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

  const response = await invokeLLM({
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

  const rawHtml = response.choices[0]?.message?.content;
  let htmlContent = typeof rawHtml === "string" ? rawHtml : "";

  // Markdown-Wrapper entfernen falls vorhanden
  htmlContent = htmlContent
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // Validierung: Muss ein vollständiges HTML-Dokument sein
  if (!htmlContent.includes("<!DOCTYPE") && !htmlContent.includes("<html")) {
    console.error("[Pipeline] Generated content is not valid HTML, wrapping");
    htmlContent = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Generierte Website</title></head><body>${htmlContent}</body></html>`;
  }

  // Extract config from HTML if present
  const configMatch = typeof htmlContent === "string" ? htmlContent.match(/const\s+CONFIG\s*=\s*(\{[\s\S]*?\});/) : null;
  let configJson: Record<string, unknown> = {};
  if (configMatch) {
    try {
      // Safe eval via Function constructor
      configJson = new Function(`return ${configMatch[1]}`)() as Record<string, unknown>;
    } catch {
      configJson = {};
    }
  }

  return { htmlContent, configJson };
}

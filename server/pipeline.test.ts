import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ScrapedPage } from "./scraper";

const callLLMMock = vi.fn();
vi.mock("./llmAdapter", () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
}));

import {
  analyzeCompetitors,
  computeSeoSignals,
  computeStructureSignals,
  extractConfigJson,
  resolveTheme,
  scoreSeoSignals,
  scoreStructureSignals,
} from "./pipeline";

function makePage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return {
    url: "https://example.com",
    title: "Beispiel GmbH",
    metaDescription: "",
    headlines: [],
    headings: [],
    paragraphs: [],
    ctaTexts: [],
    navItems: [],
    images: [],
    seo: {
      canonical: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      twitterCard: null,
      viewport: null,
      lang: null,
      jsonLd: [],
    },
    sitemapUrls: [],
    fullText: "",
    brandColors: [],
    logoUrl: null,
    ...overrides,
  };
}

describe("extractConfigJson", () => {
  it("returns {} when no CONFIG block is present", () => {
    expect(extractConfigJson("<html><body>Hi</body></html>")).toEqual({});
  });

  it("parses a well-formed JSON object literal", () => {
    const html = `<script>const CONFIG = {"hero":"Willkommen","cta":"Jetzt starten"};</script>`;
    expect(extractConfigJson(html)).toEqual({ hero: "Willkommen", cta: "Jetzt starten" });
  });

  it("parses loose JS object-literal syntax (unquoted keys, single quotes, trailing comma)", () => {
    const html = `<script>const CONFIG = { hero: 'Willkommen', items: [1, 2, 3], };</script>`;
    expect(extractConfigJson(html)).toEqual({ hero: "Willkommen", items: [1, 2, 3] });
  });

  it("returns {} for malformed object literals instead of throwing", () => {
    const html = `<script>const CONFIG = { this is not valid };</script>`;
    expect(extractConfigJson(html)).toEqual({});
  });

  it("never executes code embedded in the CONFIG block", () => {
    let sideEffect = false;
    const html = `<script>const CONFIG = (function(){ sideEffect = true; return {}; })();</script>`;
    // The regex only matches a literal `{...}` body, so an IIFE like this simply
    // fails to match (no leading "{") and falls back to {} — it must never run.
    const result = extractConfigJson(html);
    expect(result).toEqual({});
    expect(sideEffect).toBe(false);
  });

  it("never executes a classic eval-breakout payload (constructor.constructor)", () => {
    // JSON5 only understands literal values, not expressions/method calls, so this
    // fails to parse and falls back to {} — it must never reach process.exit().
    const html = `<script>const CONFIG = { x: "a".constructor.constructor("process.exit(1)")() };</script>`;
    expect(extractConfigJson(html)).toEqual({});
  });
});

describe("computeSeoSignals / scoreSeoSignals", () => {
  it("scores a page with every signal present near the top", () => {
    const page = makePage({
      metaDescription: "Eine gute Beschreibung",
      headings: [{ level: 1, text: "Titel" }],
      images: [{ url: "https://example.com/a.jpg", alt: "Bild A", width: null, height: null }],
      seo: {
        canonical: "https://example.com/",
        robots: null,
        ogTitle: "Beispiel",
        ogDescription: null,
        ogImage: null,
        twitterCard: null,
        viewport: null,
        lang: "de",
        jsonLd: [{ "@type": "Organization" }],
      },
      sitemapUrls: ["https://example.com/sitemap.xml"],
    });
    const signals = computeSeoSignals(page);
    expect(signals).toEqual({
      hasMetaDescription: true,
      hasCanonical: true,
      hasOpenGraph: true,
      hasJsonLd: true,
      hasSitemap: true,
      h1Count: 1,
      imageAltCoverage: 1,
      totalImages: 1,
    });
    expect(scoreSeoSignals(signals)).toBe(10);
  });

  it("scores a page with nothing present at the bottom", () => {
    const page = makePage({ images: [{ url: "https://example.com/a.jpg", alt: "", width: null, height: null }] });
    const signals = computeSeoSignals(page);
    expect(scoreSeoSignals(signals)).toBe(1); // clamped floor, not 0
  });

  it("gives partial (not zero) credit for multiple H1s", () => {
    const single = computeSeoSignals(makePage({ headings: [{ level: 1, text: "A" }] }));
    const multiple = computeSeoSignals(
      makePage({ headings: [{ level: 1, text: "A" }, { level: 1, text: "B" }] })
    );
    expect(scoreSeoSignals(single)).toBeGreaterThan(scoreSeoSignals(multiple));
    expect(scoreSeoSignals(multiple)).toBeGreaterThan(scoreSeoSignals(computeSeoSignals(makePage())));
  });

  it("never penalizes alt-text coverage when there are no images at all", () => {
    const signals = computeSeoSignals(makePage({ images: [] }));
    expect(signals.imageAltCoverage).toBe(1);
  });
});

describe("computeStructureSignals / scoreStructureSignals", () => {
  it("scores a well-organized page near the top", () => {
    const page = makePage({
      navItems: ["Home", "Kontakt"],
      headings: [
        { level: 1, text: "A" },
        { level: 2, text: "B" },
        { level: 3, text: "C" },
      ],
      paragraphs: new Array(15).fill("Ein ausreichend langer Absatztext fuer die Pruefung."),
      ctaTexts: ["Jetzt anfragen"],
    });
    expect(scoreStructureSignals(computeStructureSignals(page))).toBe(10);
  });

  it("scores a bare page at the floor", () => {
    expect(scoreStructureSignals(computeStructureSignals(makePage()))).toBe(1);
  });
});

describe("analyzeCompetitors", () => {
  beforeEach(() => {
    callLLMMock.mockReset();
  });

  it("ranks competitors by overall score, best first", async () => {
    callLLMMock.mockResolvedValue(
      JSON.stringify({
        usps: ["USP"],
        keywords: ["kw"],
        toneOfVoice: "Professionell",
        structurePatterns: [],
        ctaPatterns: [],
        targetAudience: "KMU",
        competitorSummaries: [],
        competitorScores: [
          { index: 1, contentScore: 3, conversionScore: 3, summary: "Schwach", strengths: [], weaknesses: ["X"] },
          { index: 2, contentScore: 9, conversionScore: 9, summary: "Stark", strengths: ["Y"], weaknesses: [] },
        ],
      })
    );

    const pages = [makePage({ url: "https://weak.example", title: "Weak" }), makePage({ url: "https://strong.example", title: "Strong" })];
    const insights = await analyzeCompetitors(pages, "manus");

    expect(insights.scores).toHaveLength(2);
    expect(insights.scores[0]!.url).toBe("https://strong.example");
    expect(insights.scores[0]!.rank).toBe(1);
    expect(insights.scores[1]!.url).toBe("https://weak.example");
    expect(insights.scores[1]!.rank).toBe(2);
    expect(insights.scores[0]!.overallScore).toBeGreaterThan(insights.scores[1]!.overallScore);
  });

  it("falls back to neutral scores for a competitor the LLM didn't judge, without failing the whole analysis", async () => {
    callLLMMock.mockResolvedValue(
      JSON.stringify({
        usps: [],
        keywords: [],
        toneOfVoice: "Professionell",
        structurePatterns: [],
        ctaPatterns: [],
        targetAudience: "Allgemein",
        competitorSummaries: [],
        competitorScores: [{ index: 1, contentScore: 8, conversionScore: 8, summary: "Gut", strengths: [], weaknesses: [] }],
      })
    );

    const pages = [makePage({ url: "https://a.example" }), makePage({ url: "https://b.example" })];
    const insights = await analyzeCompetitors(pages, "manus");

    const unjudged = insights.scores.find((s) => s.url === "https://b.example")!;
    expect(unjudged.breakdown.content).toBe(5);
    expect(unjudged.breakdown.conversion).toBe(5);
    expect(unjudged.summary).toBe("Keine detaillierte Einschätzung verfügbar.");
  });

  it("retries once on malformed JSON and succeeds if the retry is valid", async () => {
    callLLMMock
      .mockResolvedValueOnce("nicht valides json{{{")
      .mockResolvedValueOnce(
        JSON.stringify({
          usps: [],
          keywords: [],
          toneOfVoice: "Professionell",
          structurePatterns: [],
          ctaPatterns: [],
          targetAudience: "Allgemein",
          competitorSummaries: [],
          competitorScores: [{ index: 1, contentScore: 5, conversionScore: 5, summary: "OK", strengths: [], weaknesses: [] }],
        })
      );

    const insights = await analyzeCompetitors([makePage()], "manus");

    expect(callLLMMock).toHaveBeenCalledTimes(2);
    expect(insights.scores).toHaveLength(1);
  });

  it("throws a clear error instead of silently returning an empty analysis when the LLM never returns valid JSON", async () => {
    callLLMMock.mockResolvedValue("nicht valides json{{{");

    await expect(analyzeCompetitors([makePage()], "manus")).rejects.toThrow(/valides JSON/);
    expect(callLLMMock).toHaveBeenCalledTimes(2); // exhausted both attempts, didn't retry forever
  });
});

describe("resolveTheme", () => {
  it("uses the project's manual background/accent colors when colorMode is manual", () => {
    const theme = resolveTheme(
      { colorMode: "manual", backgroundColor: "#FFFFFF", accentColors: ["#112233"] },
      [makePage({ url: "https://own.example" })],
      null
    );
    expect(theme).toEqual({ backgroundColor: "#FFFFFF", accentColors: ["#112233"], logoUrl: null });
  });

  it("falls back to defaults when manual mode has no stored colors", () => {
    const theme = resolveTheme({ colorMode: "manual", backgroundColor: null, accentColors: null }, [], null);
    expect(theme.backgroundColor).toBe("#FAFAF9");
    expect(theme.accentColors).toEqual(["#C8A96E"]);
  });

  it("extracts brand colors from the marked own-site page when colorMode is extract", () => {
    const pages = [
      makePage({ url: "https://competitor.example", brandColors: ["#999999"] }),
      makePage({ url: "https://own.example", brandColors: ["#cc3366", "#003366"], logoUrl: "https://own.example/logo.png" }),
    ];
    const theme = resolveTheme(
      { colorMode: "extract", backgroundColor: null, accentColors: null },
      pages,
      "https://own.example"
    );
    expect(theme.accentColors).toEqual(["#cc3366", "#003366"]);
    expect(theme.logoUrl).toBe("https://own.example/logo.png");
    expect(theme.backgroundColor).toBe("#FAFAF9"); // background never extracted, always the safe light default
  });

  it("falls back to default accent colors when extraction finds nothing on the own site", () => {
    const pages = [makePage({ url: "https://own.example", brandColors: [] })];
    const theme = resolveTheme(
      { colorMode: "extract", backgroundColor: null, accentColors: null },
      pages,
      "https://own.example"
    );
    expect(theme.accentColors).toEqual(["#C8A96E"]);
  });

  it("still picks up the logo from the own site even in manual color mode", () => {
    const pages = [makePage({ url: "https://own.example", logoUrl: "https://own.example/logo.svg" })];
    const theme = resolveTheme(
      { colorMode: "manual", backgroundColor: "#FFFFFF", accentColors: ["#112233"] },
      pages,
      "https://own.example"
    );
    expect(theme.logoUrl).toBe("https://own.example/logo.svg");
    expect(theme.accentColors).toEqual(["#112233"]); // manual colors unaffected by logo lookup
  });

  it("has no logo when no own-site URL is given", () => {
    const theme = resolveTheme(
      { colorMode: "manual", backgroundColor: null, accentColors: null },
      [makePage({ url: "https://competitor.example", logoUrl: "https://competitor.example/logo.png" })],
      null
    );
    expect(theme.logoUrl).toBeNull();
  });
});

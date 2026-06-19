/**
 * End-to-end test of the SSE analysis route's orchestration (scraping →
 * analysis → generation → done), exercised through handleAnalyzeRequest()
 * with mock req/res — no real Express server, no real network/LLM calls.
 * The underlying functions (scrapePage, analyzeCompetitors, generateWebsite,
 * the SSRF guard) already have their own unit tests; this file verifies the
 * ROUTE'S control flow: event sequencing, status persistence, auth/ownership
 * checks, and graceful degradation on partial/total failure.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import type { ScrapedPage } from "./scraper";

const sdkMock = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: sdkMock }));

const scrapePageMock = vi.fn();
vi.mock("./scraper", () => ({ scrapePage: (...args: unknown[]) => scrapePageMock(...args) }));

const analyzeCompetitorsMock = vi.fn();
const generateWebsiteMock = vi.fn();
const resolveThemeMock = vi.fn();
vi.mock("./pipeline", async () => {
  const actual = await vi.importActual<typeof import("./pipeline")>("./pipeline");
  return {
    ...actual,
    analyzeCompetitors: (...args: unknown[]) => analyzeCompetitorsMock(...args),
    generateWebsite: (...args: unknown[]) => generateWebsiteMock(...args),
    resolveTheme: (...args: unknown[]) => resolveThemeMock(...args),
  };
});

// vi.mock factories are hoisted above all other top-level code, so the object
// they close over must be created via vi.hoisted() — a plain `const dbMock =
// {...}` declared here would still be in the temporal dead zone when the
// (also-hoisted) factory below actually runs and spreads it.
const dbMock = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getCompetitorUrlsByProject: vi.fn(),
  updateProjectStatus: vi.fn().mockResolvedValue(undefined),
  updateCompetitorUrlScraped: vi.fn().mockResolvedValue(undefined),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  upsertGeneratedWebsite: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...dbMock };
});

import { handleAnalyzeRequest } from "./routers";

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

function parseSseEvents(writes: string[]): Array<{ event: string; data: unknown }> {
  return writes.map((chunk) => {
    const match = /^event: (.+)\ndata: (.+)\n\n$/s.exec(chunk);
    if (!match) throw new Error(`Unexpected SSE chunk format: ${chunk}`);
    return { event: match[1]!, data: JSON.parse(match[2]!) };
  });
}

function createMockReqRes(opts: { cookie?: string | null; projectId?: string } = {}) {
  const cookie = opts.cookie === null ? "" : opts.cookie ?? `${COOKIE_NAME}=valid-session-token`;
  const req = {
    headers: { cookie },
    params: { projectId: opts.projectId ?? "1" },
  } as unknown as Request;

  const writes: string[] = [];
  const statusCalls: number[] = [];
  const jsonCalls: unknown[] = [];
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(),
    status: vi.fn((code: number) => {
      statusCalls.push(code);
      return res;
    }),
    json: vi.fn((body: unknown) => {
      jsonCalls.push(body);
      return res;
    }),
  };

  return {
    req,
    res: res as unknown as Response,
    statusCalls,
    jsonCalls,
    getEvents: () => parseSseEvents(writes),
  };
}

const BASE_PROJECT = {
  id: 1,
  userId: 42,
  name: "Test Projekt",
  status: "pending" as const,
  llmProvider: "manus" as const,
  colorMode: "manual" as const,
  backgroundColor: null,
  accentColors: null,
  errorMessage: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const BASE_INSIGHTS = {
  usps: ["Schnell", "Zuverlässig"],
  keywords: ["tiefbau"],
  toneOfVoice: "Professionell",
  structurePatterns: [],
  ctaPatterns: [],
  targetAudience: "KMU",
  competitorSummaries: [],
  scores: [],
};

describe("handleAnalyzeRequest (E2E pipeline orchestration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMock.authenticateRequest.mockResolvedValue({ id: 42 });
    dbMock.getProjectById.mockResolvedValue(BASE_PROJECT);
    dbMock.getCompetitorUrlsByProject.mockResolvedValue([
      { id: 1, projectId: 1, url: "https://a.example", isOwnSite: false, title: null, scrapedContent: null, scrapedAt: null, createdAt: new Date() },
      { id: 2, projectId: 1, url: "https://b.example", isOwnSite: false, title: null, scrapedContent: null, scrapedAt: null, createdAt: new Date() },
    ]);
    scrapePageMock.mockImplementation(async (url: string) => makePage({ url, title: `Titel von ${url}` }));
    analyzeCompetitorsMock.mockResolvedValue(BASE_INSIGHTS);
    resolveThemeMock.mockReturnValue({ backgroundColor: "#FAFAF9", accentColors: ["#C8A96E"], logoUrl: null, images: [] });
    generateWebsiteMock.mockResolvedValue({ htmlContent: "<!DOCTYPE html><html><body>OK</body></html>", configJson: {} });
  });

  it("runs the full happy path: scraping → analysis → generation → done, in order", async () => {
    const { req, res, getEvents } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    const events = getEvents().map((e) => e.event);
    expect(events).toEqual([
      "status", // starte scraping
      "status", // scrappe a.example
      "scraped", // a.example done
      "status", // scrappe b.example
      "scraped", // b.example done
      "status", // analysiere
      "status", // analysiere mit provider
      "analysis",
      "status", // analyse abgeschlossen
      "status", // generiere
      "status", // done
      "done",
    ]);

    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "scraping");
    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "analyzing");
    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "generating");
    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "done");
    expect(dbMock.upsertAnalysisResult).toHaveBeenCalledWith(1, BASE_INSIGHTS);
    expect(dbMock.upsertGeneratedWebsite).toHaveBeenCalledWith(1, expect.stringContaining("<!DOCTYPE"), {});
    expect(res.end).toHaveBeenCalled();
  });

  it("passes the marked own-site URL through to resolveTheme", async () => {
    dbMock.getCompetitorUrlsByProject.mockResolvedValue([
      { id: 1, projectId: 1, url: "https://own.example", isOwnSite: true, title: null, scrapedContent: null, scrapedAt: null, createdAt: new Date() },
      { id: 2, projectId: 1, url: "https://competitor.example", isOwnSite: false, title: null, scrapedContent: null, scrapedAt: null, createdAt: new Date() },
    ]);
    const { req, res } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    expect(resolveThemeMock).toHaveBeenCalledWith(
      expect.objectContaining({ colorMode: "manual" }),
      expect.any(Array),
      "https://own.example"
    );
  });

  it("rejects requests with no session cookie (401)", async () => {
    const { req, res, statusCalls, jsonCalls } = createMockReqRes({ cookie: null });
    await handleAnalyzeRequest(req, res);

    expect(statusCalls).toEqual([401]);
    expect(jsonCalls[0]).toEqual({ error: "Unauthorized" });
    expect(sdkMock.authenticateRequest).not.toHaveBeenCalled();
  });

  it("rejects requests where session verification fails (401)", async () => {
    sdkMock.authenticateRequest.mockRejectedValue(new Error("invalid token"));
    const { req, res, statusCalls } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    expect(statusCalls).toEqual([401]);
  });

  it("rejects an invalid projectId (400)", async () => {
    const { req, res, statusCalls } = createMockReqRes({ projectId: "not-a-number" });
    await handleAnalyzeRequest(req, res);

    expect(statusCalls).toEqual([400]);
  });

  it("rejects a project that doesn't belong to the requesting user (404)", async () => {
    dbMock.getProjectById.mockResolvedValue({ ...BASE_PROJECT, userId: 999 });
    const { req, res, statusCalls } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    expect(statusCalls).toEqual([404]);
  });

  it("continues past a single failed scrape and reports it as a warning, not a hard failure", async () => {
    scrapePageMock.mockImplementation(async (url: string) => {
      if (url === "https://a.example") throw new Error("SSRF: Host zeigt auf nicht erlaubte IP-Adresse: 169.254.169.254");
      return makePage({ url });
    });

    const { req, res, getEvents } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    const events = getEvents();
    const warning = events.find((e) => e.event === "warning");
    expect(warning?.data).toMatchObject({ url: "https://a.example" });
    expect((warning?.data as { message: string }).message).toContain("SSRF");
    expect(events.some((e) => e.event === "done")).toBe(true); // still completed overall
    expect(dbMock.updateProjectStatus).not.toHaveBeenCalledWith(1, "error", expect.anything());
  });

  it("emits an error event and marks the project as errored when every scrape fails", async () => {
    scrapePageMock.mockRejectedValue(new Error("network error"));
    const { req, res, getEvents } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    const events = getEvents();
    expect(events.at(-1)).toMatchObject({ event: "error" });
    expect((events.at(-1)!.data as { message: string }).message).toContain("Keine URLs konnten gescrapt werden");
    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "error", expect.stringContaining("Keine URLs"));
    expect(res.end).toHaveBeenCalled();
  });

  it("emits an error event when the analysis step throws (e.g. LLM never returned valid JSON)", async () => {
    analyzeCompetitorsMock.mockRejectedValue(new Error("Die KI-Antwort konnte nach 2 Versuchen nicht als valides JSON gelesen werden"));
    const { req, res, getEvents } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    const events = getEvents();
    expect(events.at(-1)).toMatchObject({ event: "error" });
    expect(dbMock.upsertGeneratedWebsite).not.toHaveBeenCalled();
    expect(dbMock.updateProjectStatus).toHaveBeenCalledWith(1, "error", expect.stringContaining("JSON"));
  });

  it("emits an error event when website generation throws", async () => {
    generateWebsiteMock.mockRejectedValue(new Error("Gemini-Bildgenerierung Fehler 500"));
    const { req, res, getEvents } = createMockReqRes();
    await handleAnalyzeRequest(req, res);

    const events = getEvents();
    expect(events.at(-1)).toMatchObject({ event: "error" });
    expect(dbMock.upsertGeneratedWebsite).not.toHaveBeenCalled();
  });
});

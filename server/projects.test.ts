import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getProjectsByUser: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      name: "Test Projekt",
      status: "done",
      errorMessage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
  ]),
  getProjectById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Projekt",
    status: "done",
    errorMessage: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }),
  createProject: vi.fn().mockResolvedValue(42),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  insertCompetitorUrls: vi.fn().mockResolvedValue(undefined),
  getCompetitorUrlsByProject: vi.fn().mockResolvedValue([
    { id: 1, projectId: 1, url: "https://example.com", title: "Example", scrapedContent: null, scrapedAt: null },
  ]),
  getAnalysisResult: vi.fn().mockResolvedValue({
    id: 1,
    projectId: 1,
    usps: ["USP 1"],
    keywords: ["keyword"],
    toneOfVoice: "Professional",
    structurePatterns: [],
    ctaPatterns: [],
    targetAudience: "B2C",
    competitorSummaries: [],
  }),
  getGeneratedWebsite: vi.fn().mockResolvedValue({
    id: 1,
    projectId: 1,
    htmlContent: "<html><body>Test</body></html>",
    configJson: {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }),
  updateGeneratedWebsiteHtml: vi.fn().mockResolvedValue(undefined),
  updateProjectStatus: vi.fn().mockResolvedValue(undefined),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  upsertGeneratedWebsite: vi.fn().mockResolvedValue(undefined),
  updateCompetitorUrlScraped: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// ─── Test Context ─────────────────────────────────────────────────────────────
function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("projects.list", () => {
  it("gibt Projekte des authentifizierten Nutzers zurück", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("status");
  });
});

describe("projects.get", () => {
  it("gibt ein Projekt mit URLs, Analyse und Website zurück", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.get({ id: 1 });
    expect(result).toHaveProperty("project");
    expect(result).toHaveProperty("urls");
    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("website");
    expect(result.project.id).toBe(1);
  });

  it("wirft NOT_FOUND wenn Projekt einem anderen Nutzer gehört", async () => {
    const { getProjectById } = await import("./db");
    vi.mocked(getProjectById).mockResolvedValueOnce({
      id: 99,
      userId: 999, // anderer Nutzer
      name: "Fremdes Projekt",
      status: "done",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.get({ id: 99 })).rejects.toThrow();
  });
});

describe("projects.create", () => {
  it("erstellt ein Projekt und gibt die projectId zurück", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Neues Projekt",
      urls: ["https://example.com"],
    });
    expect(result).toHaveProperty("projectId");
    expect(result.projectId).toBe(42);
  });

  it("validiert URL-Format", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        urls: ["keine-url"],
      })
    ).rejects.toThrow();
  });

  it("erfordert mindestens eine URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        urls: [],
      })
    ).rejects.toThrow();
  });
});

describe("projects.delete", () => {
  it("löscht ein Projekt erfolgreich", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("projects.updateHtml", () => {
  it("aktualisiert den HTML-Inhalt einer Website", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.updateHtml({
      projectId: 1,
      htmlContent: "<html><body>Updated</body></html>",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("auth.logout", () => {
  it("löscht den Session-Cookie und gibt success zurück", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

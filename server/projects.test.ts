import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getProjectsByUser: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      anonymousId: null,
      name: "Test Projekt",
      status: "done",
      llmProvider: "claude",
      errorMessage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
  ]),
  getProjectById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    anonymousId: null,
    name: "Test Projekt",
    status: "done",
    llmProvider: "claude",
    ownSiteUrl: null,
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
  updateProjectOwnSiteData: vi.fn().mockResolvedValue(undefined),
  upsertAnalysisResult: vi.fn().mockResolvedValue(undefined),
  upsertGeneratedWebsite: vi.fn().mockResolvedValue(undefined),
  countUnclaimedAnonymousProjects: vi.fn().mockResolvedValue(0),
  claimAnonymousProjects: vi.fn().mockResolvedValue([]),
  saveBrandAssetsToUser: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock chat-revision pipeline (real LLM call, mocked at the function boundary) ──
const reviseWebsiteViaChatMock = vi.fn().mockResolvedValue({
  reply: "Geändert.",
  htmlContent: "<html><body>Revised</body></html>",
  configJson: {},
});
vi.mock("./pipeline", async () => {
  const actual = await vi.importActual<typeof import("./pipeline")>("./pipeline");
  return {
    ...actual,
    reviseWebsiteViaChat: (...args: unknown[]) => reviseWebsiteViaChatMock(...args),
  };
});

// ─── Test Context ─────────────────────────────────────────────────────────────
function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test@example.com",
      email: "test@example.com",
      name: "Test User",
      passwordHash: null,
      loginMethod: "password",
      role: "user",
      brandLogoUrl: null,
      brandColors: null,
      brandAboutText: null,
      brandServicesText: null,
      brandContactInfo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    anonymousId: "test-anon-id",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAnonymousContext(anonymousId = "anon-visitor-1"): TrpcContext {
  return {
    user: null,
    anonymousId,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
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
      anonymousId: null,
      name: "Fremdes Projekt",
      status: "done",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.get({ id: 99 })).rejects.toThrow();
  });

  it("erlaubt einem anonymen Besucher Zugriff auf sein eigenes, noch nicht geclaimtes Projekt", async () => {
    const { getProjectById } = await import("./db");
    vi.mocked(getProjectById).mockResolvedValueOnce({
      id: 5,
      userId: null,
      anonymousId: "anon-visitor-1",
      name: "Anonymes Projekt",
      status: "pending",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createAnonymousContext("anon-visitor-1");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.get({ id: 5 });
    expect(result.project.id).toBe(5);
  });

  it("wirft NOT_FOUND wenn die anonymousId nicht zum Projekt passt", async () => {
    const { getProjectById } = await import("./db");
    vi.mocked(getProjectById).mockResolvedValueOnce({
      id: 5,
      userId: null,
      anonymousId: "anon-visitor-1",
      name: "Anonymes Projekt",
      status: "pending",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createAnonymousContext("jemand-anders");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.projects.get({ id: 5 })).rejects.toThrow();
  });
});

describe("projects.create", () => {
  it("erstellt ein Projekt und gibt die projectId zurück", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Neues Projekt",
      competitorUrls: ["https://example.com"],
    });
    expect(result).toHaveProperty("projectId");
    expect(result.projectId).toBe(42);
  });

  it("erstellt ein Projekt mit Claude-Provider", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Claude Projekt",
      competitorUrls: ["https://example.com"],
      llmProvider: "claude",
    });
    expect(result).toHaveProperty("projectId");
  });

  it("erstellt ein Projekt mit Gemini-Provider", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Gemini Projekt",
      competitorUrls: ["https://example.com"],
      llmProvider: "gemini",
    });
    expect(result).toHaveProperty("projectId");
  });

  it("validiert URL-Format", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        competitorUrls: ["keine-url"],
      })
    ).rejects.toThrow();
  });

  it("erfordert mindestens eine Mitbewerber-URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        competitorUrls: [],
      })
    ).rejects.toThrow();
  });

  it("lehnt colorMode 'extract' ohne eigene Website ab", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        competitorUrls: ["https://example.com"],
        colorMode: "extract",
      })
    ).rejects.toThrow();
  });

  it("akzeptiert colorMode 'extract' mit angegebener eigener Website", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Test",
      competitorUrls: ["https://example.com"],
      ownSiteUrl: "https://eigene-seite.example",
      colorMode: "extract",
    });
    expect(result).toHaveProperty("projectId");
  });

  it("lehnt eine Hintergrundfarbe ab, die nicht im Preset-Katalog ist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        competitorUrls: ["https://example.com"],
        colorMode: "manual",
        backgroundColor: "#123456",
      })
    ).rejects.toThrow();
  });

  it("erlaubt einem anonymen Besucher eine kostenlose Analyse ohne Konto", async () => {
    const { countUnclaimedAnonymousProjects } = await import("./db");
    vi.mocked(countUnclaimedAnonymousProjects).mockResolvedValueOnce(0);
    const ctx = createAnonymousContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Anonymes Projekt",
      competitorUrls: ["https://example.com"],
    });
    expect(result).toHaveProperty("projectId");
  });

  it("lehnt eine zweite anonyme Analyse ab (TOO_MANY_REQUESTS)", async () => {
    const { countUnclaimedAnonymousProjects } = await import("./db");
    vi.mocked(countUnclaimedAnonymousProjects).mockResolvedValueOnce(1);
    const ctx = createAnonymousContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Zweites anonymes Projekt",
        competitorUrls: ["https://example.com"],
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

describe("projects.reviseViaChat", () => {
  beforeEach(() => {
    reviseWebsiteViaChatMock.mockClear();
  });

  it("ruft die Revision-Pipeline mit dem aktuellen HTML auf und speichert das Ergebnis", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.reviseViaChat({
      projectId: 1,
      message: "Mach den Button rot",
    });
    expect(result).toEqual({ reply: "Geändert.", htmlContent: "<html><body>Revised</body></html>" });
    expect(reviseWebsiteViaChatMock).toHaveBeenCalledWith(
      "<html><body>Test</body></html>",
      "Mach den Button rot",
      "claude",
      null
    );
  });

  it("lehnt eine zu große Bilddatei ab, ohne die Revision-Pipeline aufzurufen", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const huge = "data:image/png;base64," + "A".repeat(9 * 1024 * 1024);
    await expect(
      caller.projects.reviseViaChat({
        projectId: 1,
        message: "Nutze das Bild",
        attachedImage: { dataUrl: huge, mimeType: "image/png" },
      })
    ).rejects.toThrow();
    expect(reviseWebsiteViaChatMock).not.toHaveBeenCalled();
  });

  it("lehnt fremde Projekte ab", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const { getProjectById } = await import("./db");
    vi.mocked(getProjectById).mockResolvedValueOnce({
      id: 99,
      userId: 999,
      anonymousId: null,
      name: "Fremdes Projekt",
      status: "done",
      llmProvider: "claude",
      errorMessage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    } as any);
    await expect(caller.projects.reviseViaChat({ projectId: 99, message: "Hallo" })).rejects.toThrow();
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

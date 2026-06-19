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
      llmProvider: "manus",
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
    llmProvider: "manus",
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
      urls: [{ url: "https://example.com", isOwnSite: false }],
    });
    expect(result).toHaveProperty("projectId");
    expect(result.projectId).toBe(42);
  });

  it("erstellt ein Projekt mit Claude-Provider", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Claude Projekt",
      urls: [{ url: "https://example.com", isOwnSite: false }],
      llmProvider: "claude",
    });
    expect(result).toHaveProperty("projectId");
  });

  it("erstellt ein Projekt mit Gemini-Provider", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Gemini Projekt",
      urls: [{ url: "https://example.com", isOwnSite: false }],
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
        urls: [{ url: "keine-url", isOwnSite: false }],
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

  it("erlaubt höchstens eine URL als eigene Website", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        urls: [
          { url: "https://a.example", isOwnSite: true },
          { url: "https://b.example", isOwnSite: true },
        ],
      })
    ).rejects.toThrow();
  });

  it("lehnt colorMode 'extract' ohne markierte eigene Website ab", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.projects.create({
        name: "Test",
        urls: [{ url: "https://example.com", isOwnSite: false }],
        colorMode: "extract",
      })
    ).rejects.toThrow();
  });

  it("akzeptiert colorMode 'extract' mit markierter eigener Website", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "Test",
      urls: [{ url: "https://example.com", isOwnSite: true }],
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
        urls: [{ url: "https://example.com", isOwnSite: false }],
        colorMode: "manual",
        backgroundColor: "#123456",
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
      "manus",
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
      name: "Fremdes Projekt",
      status: "done",
      llmProvider: "manus",
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

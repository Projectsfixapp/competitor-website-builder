import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BACKGROUND_PRESETS, HEX_COLOR_PATTERN, ONE_YEAR_MS } from "@shared/const";
import { validateUrlShape } from "./_core/ssrf";
import {
  claimAnonymousProjects,
  createProject,
  deleteProject,
  getAnalysisResult,
  getCompetitorUrlsByProject,
  getGeneratedWebsite,
  getProjectById,
  getProjectsByUser,
  insertCompetitorUrls,
  saveBrandAssetsToUser,
  updateCompetitorUrlScraped,
  updateGeneratedWebsiteHtml,
  updateProjectOwnSiteData,
  updateProjectStatus,
  upsertAnalysisResult,
  upsertGeneratedWebsite,
  countUnclaimedAnonymousProjects,
} from "./db";
import { auth as authService } from "./_core/auth";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  MAX_ATTACHED_IMAGE_DATA_URL_LENGTH,
  reviseWebsiteViaChat,
  validateAttachedImage,
} from "./pipeline";
import { uploadDataUrl } from "./storage";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

/** An anonymous (not-yet-signed-up) visitor owns a project via the anonymousId cookie; a signed-in user via userId. */
function canAccessProject(
  project: { userId: number | null; anonymousId: string | null },
  ctx: TrpcContext
): boolean {
  if (ctx.user) return project.userId === ctx.user.id;
  return project.userId === null && project.anonymousId === ctx.anonymousId;
}

async function claimAndCopyBrandAssets(ctx: TrpcContext, userId: number) {
  const claimed = await claimAnonymousProjects(ctx.anonymousId, userId);
  const ownSiteData = claimed.find((p) => p.ownSiteData)?.ownSiteData;
  if (ownSiteData) {
    await saveBrandAssetsToUser(userId, {
      logoUrl: ownSiteData.logoUrl,
      brandColors: ownSiteData.brandColors,
      aboutText: ownSiteData.aboutText,
      servicesText: ownSiteData.servicesText,
      contactInfo: ownSiteData.contactInfo,
    });
  }
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    register: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          password: z.string().min(8).max(255),
          name: z.string().min(1).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await authService.register(input.email, input.password, input.name);
        if (!result) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Diese E-Mail-Adresse ist bereits registriert.",
          });
        }
        await claimAndCopyBrandAssets(ctx, result.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, user: result.user } as const;
      }),

    login: publicProcedure
      .input(z.object({ email: z.string().email().max(320), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const result = await authService.login(input.email, input.password);
        if (!result) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-Mail oder Passwort ist falsch.",
          });
        }
        await claimAndCopyBrandAssets(ctx, result.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, user: result.user } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Projects ───────────────────────────────────────────────────────────────

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getProjectsByUser(ctx.user.id);
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || !canAccessProject(project, ctx)) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const urls = await getCompetitorUrlsByProject(input.id);
        const analysis = await getAnalysisResult(input.id);
        const website = await getGeneratedWebsite(input.id);
        return { project, urls, analysis, website };
      }),

    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          competitorUrls: z.array(z.string().url()).min(1).max(7),
          ownSiteUrl: z.string().url().optional(),
          llmProvider: z.enum(["gemini", "claude"]).default("claude"),
          colorMode: z.enum(["manual", "extract"]).default("manual"),
          backgroundColor: z.string().regex(HEX_COLOR_PATTERN).optional(),
          accentColors: z
            .array(z.string().regex(HEX_COLOR_PATTERN))
            .min(1)
            .max(3)
            .optional(),
          logoImage: z.object({ dataUrl: z.string(), mimeType: z.string() }).optional(),
          images: z
            .array(z.object({ dataUrl: z.string(), mimeType: z.string() }))
            .max(5)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const url of [...input.competitorUrls, ...(input.ownSiteUrl ? [input.ownSiteUrl] : [])]) {
          try {
            validateUrlShape(url);
          } catch (err) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err instanceof Error ? err.message : `Ungültige URL: ${url}`,
            });
          }
        }

        if (input.colorMode === "extract" && !input.ownSiteUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Gib deine eigene Website an, um Farben von dort zu übernehmen.",
          });
        }
        if (
          input.colorMode === "manual" &&
          input.backgroundColor &&
          !BACKGROUND_PRESETS.some(
            p => p.hex.toLowerCase() === input.backgroundColor!.toLowerCase()
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ungültige Hintergrundfarbe.",
          });
        }

        if (!ctx.user) {
          const existing = await countUnclaimedAnonymousProjects(ctx.anonymousId);
          if (existing >= 1) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message:
                "Du hast bereits deine kostenlose Analyse gestartet. Melde dich an, um weitere Projekte zu erstellen.",
            });
          }
        }

        let uploadedLogoUrl: string | null = null;
        if (input.logoImage) {
          try {
            uploadedLogoUrl = await uploadDataUrl("logos", input.logoImage);
          } catch (err) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err instanceof Error ? err.message : "Logo-Upload fehlgeschlagen.",
            });
          }
        }

        let uploadedImageUrls: string[] | null = null;
        if (input.images && input.images.length > 0) {
          try {
            uploadedImageUrls = await Promise.all(
              input.images.map(img => uploadDataUrl("images", img))
            );
          } catch (err) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err instanceof Error ? err.message : "Bild-Upload fehlgeschlagen.",
            });
          }
        }

        const projectId = await createProject({
          userId: ctx.user?.id ?? null,
          anonymousId: ctx.user ? null : ctx.anonymousId,
          name: input.name,
          llmProvider: input.llmProvider,
          colorMode: input.colorMode,
          backgroundColor:
            input.colorMode === "manual" ? (input.backgroundColor ?? null) : null,
          accentColors: input.colorMode === "manual" ? (input.accentColors ?? null) : null,
          ownSiteUrl: input.ownSiteUrl ?? null,
          uploadedLogoUrl,
          uploadedImageUrls,
        });
        await insertCompetitorUrls(projectId, input.competitorUrls);
        return { projectId };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deleteProject(input.id);
        return { success: true };
      }),

    updateHtml: protectedProcedure
      .input(z.object({ projectId: z.number(), htmlContent: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await updateGeneratedWebsiteHtml(input.projectId, input.htmlContent);
        return { success: true };
      }),

    reviseViaChat: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          message: z.string().min(1).max(2000),
          attachedImage: z
            .object({
              dataUrl: z.string().max(MAX_ATTACHED_IMAGE_DATA_URL_LENGTH),
              mimeType: z.string(),
            })
            .nullable()
            .default(null),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const website = await getGeneratedWebsite(input.projectId);
        if (!website) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Für dieses Projekt wurde noch keine Website generiert.",
          });
        }
        if (input.attachedImage) {
          try {
            validateAttachedImage(input.attachedImage);
          } catch (err) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err instanceof Error ? err.message : "Ungültiges Bild.",
            });
          }
        }

        const provider = (project.llmProvider ?? "claude") as "gemini" | "claude";
        const result = await reviseWebsiteViaChat(
          website.htmlContent,
          input.message,
          provider,
          input.attachedImage
        );
        await upsertGeneratedWebsite(
          input.projectId,
          result.htmlContent,
          result.configJson
        );

        return { reply: result.reply, htmlContent: result.htmlContent };
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ─── SSE Analysis Route (Express, not tRPC) ───────────────────────────────────
// Registered in server/_core/index.ts via registerAnalysisRoute()

import type { Express, Request, Response } from "express";
import { ANON_COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { scrapeOwnSite, scrapePage } from "./scraper";
import { analyzeCompetitors, generateWebsite, resolveTheme } from "./pipeline";

/** Extracted from registerAnalysisRoute so it can be unit/e2e-tested directly with mock req/res, without spinning up a real Express server. */
export async function handleAnalyzeRequest(
  req: Request,
  res: Response
): Promise<void> {
  let userId: number | null = null;
  try {
    const user = await authService.authenticateRequest(req);
    userId = user.id;
  } catch {
    userId = null;
  }

  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const anonymousId = cookies[ANON_COOKIE_NAME] ?? null;

  const projectId = parseInt(req.params.projectId ?? "0", 10);
  if (!projectId) {
    res.status(400).json({ error: "Invalid projectId" });
    return;
  }

  const project = await getProjectById(projectId);
  const owns =
    !!project &&
    (userId !== null
      ? project.userId === userId
      : project.userId === null && project.anonymousId === anonymousId);
  if (!project || !owns) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── Step 0: Own-site scraping (separate from competitors) ──────────────
    let ownSiteContent: Awaited<ReturnType<typeof scrapeOwnSite>> | null = null;
    if (project.ownSiteUrl) {
      send("status", {
        step: "scraping",
        message: "Scrappe deine eigene Website…",
        progress: 2,
      });
      try {
        ownSiteContent = await scrapeOwnSite(project.ownSiteUrl);
        await updateProjectOwnSiteData(projectId, ownSiteContent);
      } catch (err) {
        send("warning", {
          url: project.ownSiteUrl,
          message: `Eigene Website konnte nicht gescrapt werden: ${String(err)}`,
        });
      }
    }

    // ── Step 1: Scraping ──────────────────────────────────────────────────
    await updateProjectStatus(projectId, "scraping");
    const urlRows = await getCompetitorUrlsByProject(projectId);

    send("status", {
      step: "scraping",
      message: "Starte Scraping der Mitbewerber-URLs…",
      progress: 5,
    });

    const scrapedPages = [];
    for (let i = 0; i < urlRows.length; i++) {
      const row = urlRows[i];
      if (!row) continue;
      send("status", {
        step: "scraping",
        message: `Scrappe ${row.url}…`,
        progress: 5 + Math.round(((i + 1) / urlRows.length) * 30),
      });
      try {
        const page = await scrapePage(row.url);
        await updateCompetitorUrlScraped(row.id, page.title, page.fullText);
        scrapedPages.push(page);
        send("scraped", {
          url: row.url,
          title: page.title,
          headlines: page.headlines.slice(0, 3),
        });
      } catch (err) {
        send("warning", {
          url: row.url,
          message: `Konnte nicht gescrapt werden: ${String(err)}`,
        });
      }
    }

    if (scrapedPages.length === 0) {
      throw new Error("Keine URLs konnten gescrapt werden.");
    }

    // ── Step 2: Analysis ──────────────────────────────────────────────────
    await updateProjectStatus(projectId, "analyzing");
    send("status", {
      step: "analyzing",
      message: "Analysiere Inhalte mit KI…",
      progress: 40,
    });

    const provider = (project.llmProvider ?? "claude") as "gemini" | "claude";
    send("status", {
      step: "analyzing",
      message: `Analysiere mit ${provider === "gemini" ? "Gemini" : "Claude"}…`,
      progress: 42,
    });

    const insights = await analyzeCompetitors(scrapedPages, provider);
    await upsertAnalysisResult(projectId, insights);

    send("analysis", { insights });
    send("status", {
      step: "analyzing",
      message: "Analyse abgeschlossen.",
      progress: 65,
    });

    // ── Step 3: Generation ────────────────────────────────────────────────
    await updateProjectStatus(projectId, "generating");
    send("status", {
      step: "generating",
      message: `Generiere Website mit ${provider === "gemini" ? "Gemini" : "Claude"}…`,
      progress: 70,
    });

    const theme = resolveTheme(
      {
        colorMode: project.colorMode ?? "manual",
        backgroundColor: project.backgroundColor ?? null,
        accentColors: project.accentColors ?? null,
      },
      scrapedPages,
      project.ownSiteUrl ?? null
    );
    if (project.uploadedLogoUrl) theme.logoUrl = project.uploadedLogoUrl;
    if (project.uploadedImageUrls?.length) {
      theme.images = [...project.uploadedImageUrls, ...theme.images];
    }

    const websiteData = await generateWebsite(
      insights,
      scrapedPages,
      provider,
      theme,
      ownSiteContent
    );
    await upsertGeneratedWebsite(
      projectId,
      websiteData.htmlContent,
      websiteData.configJson
    );
    await updateProjectStatus(projectId, "done");

    send("status", {
      step: "done",
      message: "Website erfolgreich generiert!",
      progress: 100,
    });
    send("done", { projectId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateProjectStatus(projectId, "error", message);
    send("error", { message });
  } finally {
    res.end();
  }
}

export function registerAnalysisRoute(app: Express) {
  app.get("/api/analyze/:projectId", handleAnalyzeRequest);
}

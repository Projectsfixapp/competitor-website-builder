import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { validateUrlShape } from "./_core/ssrf";
import {
  createProject,
  deleteProject,
  getAnalysisResult,
  getCompetitorUrlsByProject,
  getGeneratedWebsite,
  getProjectById,
  getProjectsByUser,
  insertCompetitorUrls,
  updateCompetitorUrlScraped,
  updateGeneratedWebsiteHtml,
  updateProjectStatus,
  upsertAnalysisResult,
  upsertGeneratedWebsite,
} from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
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

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const urls = await getCompetitorUrlsByProject(input.id);
        const analysis = await getAnalysisResult(input.id);
        const website = await getGeneratedWebsite(input.id);
        return { project, urls, analysis, website };
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          urls: z.array(z.string().url()).min(1).max(7),
          llmProvider: z.enum(["manus", "gemini", "claude"]).default("manus"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const url of input.urls) {
          try {
            validateUrlShape(url);
          } catch (err) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err instanceof Error ? err.message : `Ungültige URL: ${url}`,
            });
          }
        }
        const projectId = await createProject(ctx.user.id, input.name, input.llmProvider);
        await insertCompetitorUrls(projectId, input.urls);
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
  }),
});

export type AppRouter = typeof appRouter;

// ─── SSE Analysis Route (Express, not tRPC) ───────────────────────────────────
// Registered in server/_core/index.ts via registerAnalysisRoute()

import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { scrapePage } from "./scraper";
import { analyzeCompetitors, generateWebsite } from "./pipeline";

export function registerAnalysisRoute(app: Express) {
  app.get("/api/analyze/:projectId", async (req: Request, res: Response) => {
    // Auth check
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k?.trim() ?? "", v.join("=")];
      })
    );
    const sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let userId: number;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) throw new Error("No user");
      userId = user.id;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const projectId = parseInt(req.params.projectId ?? "0", 10);
    if (!projectId) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    const project = await getProjectById(projectId);
    if (!project || project.userId !== userId) {
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
      // ── Step 1: Scraping ──────────────────────────────────────────────────
      await updateProjectStatus(projectId, "scraping");
      const urlRows = await getCompetitorUrlsByProject(projectId);

      send("status", { step: "scraping", message: "Starte Scraping der Mitbewerber-URLs…", progress: 5 });

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
          send("scraped", { url: row.url, title: page.title, headlines: page.headlines.slice(0, 3) });
        } catch (err) {
          send("warning", { url: row.url, message: `Konnte nicht gescrapt werden: ${String(err)}` });
        }
      }

      if (scrapedPages.length === 0) {
        throw new Error("Keine URLs konnten gescrapt werden.");
      }

      // ── Step 2: Analysis ──────────────────────────────────────────────────
      await updateProjectStatus(projectId, "analyzing");
      send("status", { step: "analyzing", message: "Analysiere Inhalte mit KI…", progress: 40 });

      const provider = (project.llmProvider ?? "manus") as "manus" | "gemini" | "claude";
      send("status", { step: "analyzing", message: `Analysiere mit ${provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "Manus"}…`, progress: 42 });

      const insights = await analyzeCompetitors(scrapedPages, provider);
      await upsertAnalysisResult(projectId, insights);

      send("analysis", { insights });
      send("status", { step: "analyzing", message: "Analyse abgeschlossen.", progress: 65 });

      // ── Step 3: Generation ────────────────────────────────────────────────
      await updateProjectStatus(projectId, "generating");
      send("status", { step: "generating", message: `Generiere Website mit ${provider === "gemini" ? "Gemini" : provider === "claude" ? "Claude" : "Manus"}…`, progress: 70 });

      const websiteData = await generateWebsite(insights, scrapedPages, provider);
      await upsertGeneratedWebsite(projectId, websiteData.htmlContent, websiteData.configJson);
      await updateProjectStatus(projectId, "done");

      send("status", { step: "done", message: "Website erfolgreich generiert!", progress: 100 });
      send("done", { projectId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateProjectStatus(projectId, "error", message);
      send("error", { message });
    } finally {
      res.end();
    }
  });
}

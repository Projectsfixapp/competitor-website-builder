import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  analysisResults,
  competitorUrls,
  generatedWebsites,
  projects,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function createProject(userId: number, name: string, llmProvider: "manus" | "gemini" | "claude" = "manus") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(projects).values({ userId, name, status: "pending", llmProvider });
  return result[0].insertId as number;
}

export async function getProjectsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result[0];
}

export async function updateProjectStatus(
  id: number,
  status: "pending" | "scraping" | "analyzing" | "generating" | "done" | "error",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(projects)
    .set({ status, errorMessage: errorMessage ?? null })
    .where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(competitorUrls).where(eq(competitorUrls.projectId, id));
  await db.delete(analysisResults).where(eq(analysisResults.projectId, id));
  await db.delete(generatedWebsites).where(eq(generatedWebsites.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Competitor URLs ──────────────────────────────────────────────────────────

export async function insertCompetitorUrls(projectId: number, urls: string[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const url of urls) {
    await db.insert(competitorUrls).values({ projectId, url });
  }
}

export async function getCompetitorUrlsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(competitorUrls).where(eq(competitorUrls.projectId, projectId));
}

export async function updateCompetitorUrlScraped(
  id: number,
  title: string,
  scrapedContent: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(competitorUrls)
    .set({ title, scrapedContent, scrapedAt: new Date() })
    .where(eq(competitorUrls.id, id));
}

// ─── Analysis Results ─────────────────────────────────────────────────────────

export async function upsertAnalysisResult(
  projectId: number,
  data: {
    usps: string[];
    keywords: string[];
    toneOfVoice: string;
    structurePatterns: string[];
    ctaPatterns: string[];
    targetAudience: string;
    competitorSummaries: Array<{ url: string; title: string; summary: string; usps: string[] }>;
    scores: Array<{
      url: string;
      title: string;
      rank: number;
      overallScore: number;
      breakdown: { content: number; seo: number; structure: number; conversion: number };
      summary: string;
      strengths: string[];
      weaknesses: string[];
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(analysisResults)
    .where(eq(analysisResults.projectId, projectId))
    .limit(1);
  if (existing.length > 0) {
    await db.update(analysisResults).set(data).where(eq(analysisResults.projectId, projectId));
  } else {
    await db.insert(analysisResults).values({ projectId, ...data });
  }
}

export async function getAnalysisResult(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisResults)
    .where(eq(analysisResults.projectId, projectId))
    .limit(1);
  return result[0];
}

// ─── Generated Websites ───────────────────────────────────────────────────────

export async function upsertGeneratedWebsite(
  projectId: number,
  htmlContent: string,
  configJson: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(generatedWebsites)
    .where(eq(generatedWebsites.projectId, projectId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(generatedWebsites)
      .set({ htmlContent, configJson })
      .where(eq(generatedWebsites.projectId, projectId));
  } else {
    await db.insert(generatedWebsites).values({ projectId, htmlContent, configJson });
  }
}

export async function getGeneratedWebsite(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(generatedWebsites)
    .where(eq(generatedWebsites.projectId, projectId))
    .limit(1);
  return result[0];
}

export async function updateGeneratedWebsiteHtml(projectId: number, htmlContent: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(generatedWebsites)
    .set({ htmlContent })
    .where(eq(generatedWebsites.projectId, projectId));
}

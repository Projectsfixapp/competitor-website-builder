import { and, eq, gte, isNull, sql } from "drizzle-orm";
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

export async function createUser(user: InsertUser): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const isOwner =
    ENV.ownerEmail.length > 0 && user.email?.toLowerCase() === ENV.ownerEmail.toLowerCase();
  const result = await db.insert(users).values({
    ...user,
    role: isOwner ? "admin" : "user",
    lastSignedIn: new Date(),
  });
  return result[0].insertId as number;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function touchLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

/** Copies a claimed project's own-site brand assets onto the user record, for reuse by future modules. */
export async function saveBrandAssetsToUser(
  userId: number,
  assets: {
    logoUrl: string | null;
    brandColors: string[] | null;
    aboutText: string | null;
    servicesText: string | null;
    contactInfo: Record<string, string> | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      brandLogoUrl: assets.logoUrl,
      brandColors: assets.brandColors,
      brandAboutText: assets.aboutText,
      brandServicesText: assets.servicesText,
      brandContactInfo: assets.contactInfo,
    })
    .where(eq(users.id, userId));
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export type CreateProjectInput = {
  userId: number | null;
  anonymousId: string | null;
  name: string;
  llmProvider: "gemini" | "claude";
  colorMode: "manual" | "extract";
  backgroundColor: string | null;
  accentColors: string[] | null;
  ownSiteUrl: string | null;
  uploadedLogoUrl: string | null;
  uploadedImageUrls: string[] | null;
};

export async function createProject(input: CreateProjectInput) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(projects).values({
    userId: input.userId,
    anonymousId: input.anonymousId,
    name: input.name,
    status: "pending",
    llmProvider: input.llmProvider,
    colorMode: input.colorMode,
    backgroundColor: input.backgroundColor,
    accentColors: input.accentColors,
    ownSiteUrl: input.ownSiteUrl,
    uploadedLogoUrl: input.uploadedLogoUrl,
    uploadedImageUrls: input.uploadedImageUrls,
  });
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

/** One free, unclaimed analysis per anonymous visitor — additional ones require an account. */
export async function countUnclaimedAnonymousProjects(anonymousId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(and(eq(projects.anonymousId, anonymousId), isNull(projects.userId)));
  return Number(result[0]?.count ?? 0);
}

/** Attaches any unclaimed anonymous projects to a newly registered/logged-in user, returning what was claimed. */
export async function claimAnonymousProjects(anonymousId: string, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const unclaimed = await db
    .select()
    .from(projects)
    .where(and(eq(projects.anonymousId, anonymousId), isNull(projects.userId)));
  if (unclaimed.length === 0) return [];
  await db
    .update(projects)
    .set({ userId, anonymousId: null })
    .where(and(eq(projects.anonymousId, anonymousId), isNull(projects.userId)));
  return unclaimed;
}

export async function updateProjectOwnSiteData(
  id: number,
  ownSiteData: {
    title: string;
    logoUrl: string | null;
    brandColors: string[];
    aboutText: string | null;
    servicesText: string | null;
    contactInfo: Record<string, string> | null;
  }
) {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set({ ownSiteData }).where(eq(projects.id, id));
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

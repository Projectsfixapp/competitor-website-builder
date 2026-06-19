import {
  boolean,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "scraping", "analyzing", "generating", "done", "error"])
    .default("pending")
    .notNull(),
  llmProvider: mysqlEnum("llmProvider", ["manus", "gemini", "claude"])
    .default("manus")
    .notNull(),
  colorMode: mysqlEnum("colorMode", ["manual", "extract"]).default("manual").notNull(),
  backgroundColor: varchar("backgroundColor", { length: 16 }),
  accentColors: json("accentColors").$type<string[]>(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Competitor URLs ──────────────────────────────────────────────────────────

export const competitorUrls = mysqlTable("competitor_urls", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  url: text("url").notNull(),
  isOwnSite: boolean("isOwnSite").default(false).notNull(),
  title: text("title"),
  scrapedContent: text("scrapedContent"),
  scrapedAt: timestamp("scrapedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CompetitorUrl = typeof competitorUrls.$inferSelect;
export type InsertCompetitorUrl = typeof competitorUrls.$inferInsert;

// ─── Analysis Results ─────────────────────────────────────────────────────────

export const analysisResults = mysqlTable("analysis_results", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().unique(),
  usps: json("usps").$type<string[]>(),
  keywords: json("keywords").$type<string[]>(),
  toneOfVoice: text("toneOfVoice"),
  structurePatterns: json("structurePatterns").$type<string[]>(),
  ctaPatterns: json("ctaPatterns").$type<string[]>(),
  targetAudience: text("targetAudience"),
  competitorSummaries: json("competitorSummaries").$type<
    Array<{ url: string; title: string; summary: string; usps: string[] }>
  >(),
  scores: json("scores").$type<
    Array<{
      url: string;
      title: string;
      rank: number;
      overallScore: number;
      breakdown: { content: number; seo: number; structure: number; conversion: number };
      summary: string;
      strengths: string[];
      weaknesses: string[];
    }>
  >(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = typeof analysisResults.$inferInsert;

// ─── Generated Websites ───────────────────────────────────────────────────────

export const generatedWebsites = mysqlTable("generated_websites", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().unique(),
  // longtext, not text: a full HTML5 doc with inline CSS/JS (and later inline
  // base64 images) easily exceeds the 64KB TEXT limit, which MySQL truncates
  // silently rather than erroring.
  htmlContent: longtext("htmlContent").notNull(),
  configJson: json("configJson").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GeneratedWebsite = typeof generatedWebsites.$inferSelect;
export type InsertGeneratedWebsite = typeof generatedWebsites.$inferInsert;

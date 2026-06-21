import {
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
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Brand assets captured once (from a customer's own-site scrape at project
  // creation, copied here when an anonymous project is claimed) so future
  // modules (CI, Druckdateien, Marketing, AI-Tools) can reuse them without
  // re-asking the customer for their URL.
  brandLogoUrl: varchar("brandLogoUrl", { length: 2048 }),
  brandColors: json("brandColors").$type<string[]>(),
  brandAboutText: text("brandAboutText"),
  brandServicesText: text("brandServicesText"),
  brandContactInfo: json("brandContactInfo").$type<Record<string, string>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable: anonymous (not-yet-signed-up) visitors can create one free
  // preview project, identified by anonymousId instead. See claimAnonymousProjects.
  userId: int("userId"),
  anonymousId: varchar("anonymousId", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "scraping", "analyzing", "generating", "done", "error"])
    .default("pending")
    .notNull(),
  llmProvider: mysqlEnum("llmProvider", ["gemini", "claude"])
    .default("claude")
    .notNull(),
  colorMode: mysqlEnum("colorMode", ["manual", "extract"]).default("manual").notNull(),
  backgroundColor: varchar("backgroundColor", { length: 16 }),
  accentColors: json("accentColors").$type<string[]>(),
  // Customer's own website — kept separate from competitorUrls (which are
  // always competitors now). Scraped independently so real Über-uns/Leistungen/
  // Impressum content can be reused in the generated site instead of invented.
  ownSiteUrl: varchar("ownSiteUrl", { length: 2048 }),
  ownSiteData: json("ownSiteData").$type<{
    title: string;
    logoUrl: string | null;
    brandColors: string[];
    aboutText: string | null;
    servicesText: string | null;
    contactInfo: Record<string, string> | null;
  }>(),
  uploadedLogoUrl: varchar("uploadedLogoUrl", { length: 2048 }),
  uploadedImageUrls: json("uploadedImageUrls").$type<string[]>(),
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

ALTER TABLE `analysis_results` MODIFY COLUMN `usps` json;--> statement-breakpoint
ALTER TABLE `analysis_results` MODIFY COLUMN `keywords` json;--> statement-breakpoint
ALTER TABLE `analysis_results` MODIFY COLUMN `structurePatterns` json;--> statement-breakpoint
ALTER TABLE `analysis_results` MODIFY COLUMN `ctaPatterns` json;--> statement-breakpoint
ALTER TABLE `analysis_results` MODIFY COLUMN `competitorSummaries` json;--> statement-breakpoint
ALTER TABLE `generated_websites` MODIFY COLUMN `configJson` json;
ALTER TABLE `projects` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `llmProvider` enum('gemini','claude') NOT NULL DEFAULT 'claude';--> statement-breakpoint
ALTER TABLE `projects` ADD `anonymousId` varchar(64);--> statement-breakpoint
ALTER TABLE `projects` ADD `ownSiteUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `projects` ADD `ownSiteData` json;--> statement-breakpoint
ALTER TABLE `projects` ADD `uploadedLogoUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `projects` ADD `uploadedImageUrls` json;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `brandLogoUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `users` ADD `brandColors` json;--> statement-breakpoint
ALTER TABLE `users` ADD `brandAboutText` text;--> statement-breakpoint
ALTER TABLE `users` ADD `brandServicesText` text;--> statement-breakpoint
ALTER TABLE `users` ADD `brandContactInfo` json;--> statement-breakpoint
ALTER TABLE `competitor_urls` DROP COLUMN `isOwnSite`;
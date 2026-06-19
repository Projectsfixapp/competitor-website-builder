ALTER TABLE `competitor_urls` ADD `isOwnSite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `colorMode` enum('manual','extract') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `backgroundColor` varchar(16);--> statement-breakpoint
ALTER TABLE `projects` ADD `accentColors` json;
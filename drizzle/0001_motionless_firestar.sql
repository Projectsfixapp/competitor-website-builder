CREATE TABLE `analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`usps` json,
	`keywords` json,
	`toneOfVoice` text,
	`structurePatterns` json,
	`ctaPatterns` json,
	`targetAudience` text,
	`competitorSummaries` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysis_results_projectId_unique` UNIQUE(`projectId`)
);
--> statement-breakpoint
CREATE TABLE `competitor_urls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`scrapedContent` text,
	`scrapedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `competitor_urls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_websites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`htmlContent` text NOT NULL,
	`configJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generated_websites_id` PRIMARY KEY(`id`),
	CONSTRAINT `generated_websites_projectId_unique` UNIQUE(`projectId`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('pending','scraping','analyzing','generating','done','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);

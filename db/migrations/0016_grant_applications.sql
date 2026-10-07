CREATE TABLE `grant_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`status` text NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`note` text,
	`model` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grant_applications_grant_id_unique` ON `grant_applications` (`grant_id`);
CREATE TABLE `mind_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`nodes` text DEFAULT '[]' NOT NULL,
	`edges` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mind_maps_updated_idx` ON `mind_maps` (`updated_at`);
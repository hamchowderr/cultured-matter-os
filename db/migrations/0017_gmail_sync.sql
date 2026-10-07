CREATE TABLE `gmail_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`days` integer NOT NULL,
	`pending` text NOT NULL,
	`total` integer NOT NULL,
	`listed_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);

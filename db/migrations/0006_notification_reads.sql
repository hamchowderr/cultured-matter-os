CREATE TABLE `notification_reads` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`read_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `notification_reads_read_at_idx` ON `notification_reads` (`read_at`);
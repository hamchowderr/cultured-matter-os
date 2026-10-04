CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`calendar_token` text,
	`daily_email` integer DEFAULT false NOT NULL,
	`last_summary_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_calendar_token_unique` ON `user_settings` (`calendar_token`);
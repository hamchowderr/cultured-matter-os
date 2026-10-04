ALTER TABLE `user_settings` ADD `work_scope` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `personal_seeded` integer DEFAULT false NOT NULL;
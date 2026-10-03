ALTER TABLE `contacts` ADD `newsletter` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `newsletter_changed_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `newsletter_synced_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `fluentcrm_id` integer;
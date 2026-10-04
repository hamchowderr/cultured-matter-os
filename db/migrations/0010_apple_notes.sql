CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`folder` text,
	`note_created_at` integer,
	`note_modified_at` integer,
	`source` text DEFAULT 'apple_notes' NOT NULL,
	`kind` text,
	`tier` integer,
	`project_id` text,
	`sector` text,
	`personal` integer,
	`capture_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_dedupe_key_unique` ON `notes` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notes_created_idx` ON `notes` (`note_created_at`);--> statement-breakpoint
CREATE INDEX `notes_folder_idx` ON `notes` (`folder`);
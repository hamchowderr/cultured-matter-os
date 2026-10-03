CREATE TABLE `contact_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`message_id` text NOT NULL,
	`conversation_id` text,
	`subject` text,
	`direction` text NOT NULL,
	`at` integer NOT NULL,
	`web_link` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_emails_contact_message_unique` ON `contact_emails` (`contact_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `contact_emails_contact_at_idx` ON `contact_emails` (`contact_id`,`at`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `outlook_conversation_id` text;
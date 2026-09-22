CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `activity_log_at_idx` ON `activity_log` (`at`);--> statement-breakpoint
CREATE INDEX `activity_log_entity_idx` ON `activity_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` integer,
	`result` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`rubric_version` text NOT NULL,
	`scores` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assessments_company_idx` ON `assessments` (`company_id`);--> statement-breakpoint
CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`kind` text,
	`tier` integer,
	`project_id` text,
	`filed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `captures_filed_idx` ON `captures` (`filed_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`normalized_name` text NOT NULL,
	`description` text,
	`website` text,
	`stage` text,
	`categories` text DEFAULT '[]' NOT NULL,
	`cohort_year` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`status_note` text,
	`status_changed_at` integer,
	`first_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_domain_unique` ON `companies` (`domain`);--> statement-breakpoint
CREATE INDEX `companies_normalized_name_idx` ON `companies` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `companies_status_idx` ON `companies` (`status`);--> statement-breakpoint
CREATE INDEX `companies_first_seen_idx` ON `companies` (`first_seen_at`);--> statement-breakpoint
CREATE TABLE `contact_links` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`company_id` text,
	`pairing_id` text,
	`relation` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pairing_id`) REFERENCES `pairings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_links_contact_idx` ON `contact_links` (`contact_id`);--> statement-breakpoint
CREATE INDEX `contact_links_company_idx` ON `contact_links` (`company_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text,
	`last_name` text,
	`full_name` text NOT NULL,
	`email` text,
	`profile_url` text,
	`company` text,
	`company_domain` text,
	`position` text,
	`connected_on` text,
	`sectors` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_profile_url_unique` ON `contacts` (`profile_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `contacts_company_idx` ON `contacts` (`company`);--> statement-breakpoint
CREATE INDEX `contacts_company_domain_idx` ON `contacts` (`company_domain`);--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`agency` text,
	`amount_min` real,
	`amount_max` real,
	`deadline` integer,
	`for_profit_eligible` integer DEFAULT false NOT NULL,
	`url` text,
	`description` text,
	`status` text,
	`raw` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_source_external_unique` ON `grants` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `grants_deadline_idx` ON `grants` (`deadline`);--> statement-breakpoint
CREATE INDEX `grants_status_idx` ON `grants` (`status`);--> statement-breakpoint
CREATE TABLE `pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`brand_name` text NOT NULL,
	`brand_domain` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pairings_company_idx` ON `pairings` (`company_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text DEFAULT 'Cultured Matter' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_business_idx` ON `projects` (`business`);--> statement-breakpoint
CREATE TABLE `sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`seen_at` integer NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sightings_source_external_unique` ON `sightings` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `sightings_company_idx` ON `sightings` (`company_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`last_checked_at` integer,
	`last_status` text,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_slug_unique` ON `sources` (`slug`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`parent_task_id` text,
	`capture_id` text,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`due_date` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_due_idx` ON `tasks` (`status`,`due_date`);
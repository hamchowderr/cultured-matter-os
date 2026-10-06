-- Her voice guide (Settings > Your voice): one row (id = main, enforced by a CHECK) holding the
-- guide the AI follows when it drafts text for her, and which samples it was built from.
CREATE TABLE `voice_guide` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`guide` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "voice_guide_single_row" CHECK("voice_guide"."id" = 'main')
);

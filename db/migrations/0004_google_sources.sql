-- Data only, no schema change: Outlook was replaced by Gmail and Google Contacts.
-- Contacts imported from Outlook count as imported from Google (the source enum no longer has
-- "outlook"), and follow-up drafts still waiting for approval are saved in Gmail instead.
UPDATE `contacts` SET `source` = 'google' WHERE `source` = 'outlook';--> statement-breakpoint
UPDATE `approvals` SET `action` = 'gmail_draft' WHERE `action` = 'outlook_draft' AND `status` = 'pending';

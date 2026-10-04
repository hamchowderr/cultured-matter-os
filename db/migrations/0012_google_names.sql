-- Google names for the follow-up thread column and the logged Gmail actions; drops the unused
-- Microsoft sign-in link.
ALTER TABLE `tasks` RENAME COLUMN `outlook_conversation_id` TO `email_thread_id`;--> statement-breakpoint
UPDATE `activity_log` SET `action` = 'syncGoogle' WHERE `action` = 'syncOutlook';--> statement-breakpoint
UPDATE `activity_log` SET `action` = 'checkGmailReplies' WHERE `action` = 'checkOutlookReplies';--> statement-breakpoint
DELETE FROM `accounts` WHERE `provider_id` = 'microsoft';

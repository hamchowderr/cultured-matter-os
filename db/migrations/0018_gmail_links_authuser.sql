-- Saved Gmail links used the address in the /u/ path, which can fail with "account temporarily
-- unavailable" (6446). Rewrite them to the ?authuser= form lib/google.ts now builds:
-- https://mail.google.com/mail/u/<address>/#all/<id> -> https://mail.google.com/mail/?authuser=<address>#all/<id>
UPDATE `contact_emails`
SET `web_link` = replace(replace(`web_link`, 'https://mail.google.com/mail/u/', 'https://mail.google.com/mail/?authuser='), '/#', '#')
WHERE `web_link` LIKE 'https://mail.google.com/mail/u/%';

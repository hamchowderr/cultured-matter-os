# Website handover (WordPress + FluentCRM)

Simone's demo website and FluentCRM run as one WordPress install on the owner's Hostinger VPS, under Coolify. This runbook covers how the install is built, how it is backed up, and how to move it to her own hosting when she is ready. Beads issue: `cmos-opj`.

## What runs where

| Part           | Value                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Host           | Hostinger VPS `191.101.15.236`, Coolify v4 at `https://coolify.otakusolutions.io`                            |
| Coolify        | Project "Cultured Matter Site", environment `production`, one-click `wordpress-with-mariadb`                 |
| Containers     | `wordpress:latest` (Apache + PHP) and `mariadb:11`, on the service's own private network                     |
| Volumes        | `wordpress-files` → `/var/www/html` (core, `wp-content`, `wp-config.php`); `mariadb-data` → `/var/lib/mysql` |
| Demo address   | `https://culturedmatter.otakusolutions.io` (Traefik issues the Let's Encrypt certificate)                    |
| Search engines | Discouraged (`blog_public` = 0). It is a demo.                                                               |

Nothing is shared with the owner's other services: no shared database, no shared volume, and the service is not connected to Coolify's shared `coolify` network.

Her live site (`culturedmatter.com`) and her mail (`simonepaz.com`, Google Workspace) are not touched by this install. Their DNS changes only at cut-over, in the step below.

## Accounts

| Account       | Role                                                   | Who                                                                                         |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `otaku-admin` | Administrator                                          | The owner. Password in Infisical `/cultured-matter-os`, env `prod`: `CM_WP_ADMIN_PASSWORD`. |
| `cm-api`      | Administrator (FluentCRM free has no CRM Manager role) | The app's API user. Application password "Cultured Matter OS".                              |
| Simone        | Editor, plus FluentCRM access                          | Not created yet. Created only when the owner approves.                                      |

Secrets are never written to git. Names in Infisical (`/cultured-matter-os`):

- `prod`: `CM_WP_ADMIN_PASSWORD`, `CM_WP_DB_PASSWORD` (copy of the Coolify-generated value, for restores)
- `dev` and `staging`: `FLUENTCRM_URL`, `FLUENTCRM_USER`, `FLUENTCRM_APP_PASSWORD`, `FLUENTCRM_LIST_ID`, `NEWSLETTER_WEBHOOK_SECRET`
- `prod` app values wait for the owner's approval, because they connect the live app.

## Build steps

These are the steps that set up the install. Run the Coolify CLI from PowerShell (Git Bash rewrites leading-slash arguments).

1. **DNS.** In Cloudflare, zone `otakusolutions.io`, add an `A` record: name `culturedmatter`, content `191.101.15.236`, proxy status **DNS only** (grey cloud), so Traefik can complete the Let's Encrypt HTTP-01 challenge. The zone has no wildcard record.
2. **Project and service.**
   ```powershell
   coolify project create --name "Cultured Matter Site"
   coolify service create wordpress-with-mariadb --server-uuid sq3c52uczu81384adrlo7w77 `
     --project-uuid <project uuid> --environment-name production --name "Cultured Matter WordPress"
   ```
   Set the WordPress domain to `https://culturedmatter.otakusolutions.io` (service → wordpress → Domains), then **Deploy**. Use Deploy, not the API `start`; `start` can leave compose stacks in `Created`.
3. **WP-CLI.** `wordpress:latest` has no `wp` binary. Run the `wordpress:cli` image against the live container's files and network, as uid 33 (`www-data`):
   ```sh
   WP=wordpress-<service uuid>
   docker run --rm --user 33:33 --volumes-from "$WP" --network container:"$WP" \
     -e WORDPRESS_DB_HOST=mariadb -e WORDPRESS_DB_NAME=wordpress \
     --env-file <(docker exec "$WP" env | grep '^WORDPRESS_DB_\(USER\|PASSWORD\)=') \
     wordpress:cli wp <command>
   ```
4. **Install and settings.**
   ```sh
   wp core install --url=https://culturedmatter.otakusolutions.io --title="Cultured Matter" \
     --admin_user=otaku-admin --admin_email=<owner email> --admin_password="$CM_WP_ADMIN_PASSWORD" --skip-email
   wp option update blog_public 0
   wp rewrite structure '/%postname%/' --hard
   wp plugin install fluent-crm --activate
   ```
5. **Cron.** Set `define('DISABLE_WP_CRON', true);` in `wp-config.php` and add a Coolify scheduled task (CLI only; the UI form discards it):
   ```powershell
   coolify service task create <service uuid> --name "WordPress cron" `
     --command 'su -s /bin/sh -c "php /var/www/html/wp-cron.php" www-data' `
     --frequency "* * * * *" --container wordpress --timeout 55
   ```
6. **App connection.**
   ```sh
   wp user create cm-api <api email> --role=administrator
   wp user application-password create cm-api "Cultured Matter OS" --porcelain   # shown once
   ```
   Create the list in FluentCRM → Contacts → Lists ("Newsletter"). Its ID is `FLUENTCRM_LIST_ID`. The other values are in `docs/newsletter.md`.
7. **Unsubscribe webhook.** Needs FluentCRM Pro (automations). Point it at a stable app URL only. Vercel preview URLs change per deployment and sit behind deployment protection, so a webhook aimed at one breaks. Full setup: `docs/newsletter.md`, step 4.

## Backups

| What                      | How                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database (MariaDB)        | Coolify scheduled backup on the service's `mariadb` database, daily `0 3 * * *`, keep 7 locally. Set in the UI: service → mariadb → Backups. The `/databases/{uuid}/backups` API only accepts standalone databases. |
| Files (`wordpress-files`) | Coolify volume backup on the service storage, daily `0 3 * * *`, keep 7: `PUT /api/v1/services/{uuid}/storages/{storage_uuid}/backups`.                                                                             |
| Off-server copy           | None yet. Both backups stay on the same VPS. Add an S3 destination (`coolify s3 create`) and set `save_s3` on both schedules before the site holds real data.                                                       |

Test a restore before the handover: restore both into a scratch service and load the site.

## Export

Choose one method.

**A. Database dump plus `wp-content` (exact, no plugin).**

```sh
WP=wordpress-<service uuid>; DB=mariadb-<service uuid>
docker exec "$DB" sh -c 'mariadb-dump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --single-transaction --default-character-set=utf8mb4 wordpress' \
  | gzip > culturedmatter-db-$(date +%F).sql.gz
docker run --rm --volumes-from "$WP" -v "$PWD":/out alpine \
  tar czf /out/culturedmatter-wp-content-$(date +%F).tar.gz -C /var/www/html wp-content
```

Download both files with `scp` or SFTP. Do not include `wp-config.php`: the new host makes its own, with its own database credentials and salts.

**B. Migration plugin (for a non-technical host).** Install All-in-One WP Migration or Duplicator, export one archive, then import it on the new host. Watch the archive size against the free tier's upload limit.

## Moving it

### To her own WordPress hosting

1. Create an empty WordPress site at the new host. Note its database name, user and table prefix (this install uses `wp_`).
2. Import the database dump (phpMyAdmin or `mysql < dump.sql`). Upload `wp-content` over the new one.
3. Change the address while it is still on a temporary URL, with `wp search-replace` so serialized data stays valid:
   ```sh
   wp search-replace 'https://culturedmatter.otakusolutions.io' 'https://<new address>' --all-tables --precise
   wp rewrite flush --hard
   ```
4. Log in, check pages, media and FluentCRM contacts and lists.

### To her own Coolify server

1. Deploy the same one-click `wordpress-with-mariadb` service on her server.
2. Before the first visit, stop the `wordpress` container, then restore the dump into her `mariadb` and copy `wp-content` into her `wordpress-files` volume (same commands as Export, run in reverse).
3. Start it, run the `search-replace` above, then add the cron task and both backup schedules on her server.

## DNS cut-over to culturedmatter.com

Only when she is ready, and only the web records. Her Google Workspace mail records (`MX`, `SPF` TXT, DKIM `google._domainkey`, `DMARC`) on `simonepaz.com` and `culturedmatter.com` stay exactly as they are.

1. A day before, lower the TTL of the `culturedmatter.com` `A` and `www` records to 300 seconds.
2. Point `culturedmatter.com` (`A`) and `www` (`CNAME` to the apex, or `A`) at the new host. Remove the Squarespace records for those two names only.
3. Run `wp search-replace` from the temporary address to `https://culturedmatter.com`, and set the domain in the host (or in Coolify) so a certificate is issued.
4. Turn on search engines: `wp option update blog_public 1`.
5. Update the app: `FLUENTCRM_URL=https://culturedmatter.com` in Infisical and Vercel, then redeploy. Point the FluentCRM webhook and any Squarespace or Zapier signup at the app's production URL.
6. Cancel the Squarespace plan only after the new site has served traffic for a few days.

## Handing over admin

1. Create her account as Administrator on the new install (or promote her existing Editor account).
2. She logs in and changes her password. She adds her own application password for the app if she wants to rotate `cm-api`.
3. Delete `otaku-admin`, reassigning its content to her: `wp user delete otaku-admin --reassign=<her user id>`.
4. Rotate the database password and the WordPress salts (`wp config shuffle-salts`).
5. On the owner's VPS, delete the Coolify service and its volumes only after the new site is confirmed working and a final backup is downloaded. Remove the `culturedmatter` `A` record from the `otakusolutions.io` zone.

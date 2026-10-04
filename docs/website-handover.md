# Website handover (WordPress + FluentCRM)

Simone's demo website and FluentCRM run as one WordPress install on the owner's Hostinger VPS, under Coolify. This runbook covers how the install is built, how it is backed up, and how to move it to her own hosting when she is ready. Beads issue: `cmos-opj`.

## What runs where

| Part           | Value                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host           | Hostinger VPS `191.101.15.236`, Coolify v4 at `https://coolify.otakusolutions.io`                                                                      |
| Coolify        | Service `cultured-matter-site` (`moss6ndtjuiixvkd0t2fcjyr`) in project "Otaku Solutions", environment `production`, one-click `wordpress-with-mariadb` |
| Plugins        | FluentCRM 3.2.5 (free), FluentAuth (`fluent-security`) 3.0.4                                                                                           |
| Containers     | `wordpress:latest` (Apache + PHP) and `mariadb:11`, on the service's own private network                                                               |
| Volumes        | `wordpress-files` → `/var/www/html` (core, `wp-content`, `wp-config.php`); `mariadb-data` → `/var/lib/mysql`                                           |
| Demo address   | `https://culturedmatter.otakusolutions.io` (Traefik issues the Let's Encrypt certificate)                                                              |
| Search engines | Discouraged (`blog_public` = 0). It is a demo.                                                                                                         |

Nothing is shared with the owner's other services: no shared database, no shared volume, and the service is not connected to Coolify's shared `coolify` network.

Her live site (`culturedmatter.com`) and her mail (`simonepaz.com`, Google Workspace) are not touched by this install. Their DNS changes only at cut-over, in the step below.

## Accounts

| Account       | Role                                           | Who                                                                                          |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `otaku-admin` | Administrator                                  | The owner. The app connects as this user with the application password "cultured-matter-os". |
| `simone`      | Editor (`simone@simonepaz.com`, no email sent) | Simone. FluentCRM access is granted in FluentCRM → Settings → Managers.                      |

Secrets are never written to git. Names in Infisical (`/cultured-matter-os`):

- `prod`: `CM_SITE_WP_ADMIN_USER`, `CM_SITE_WP_ADMIN_PASSWORD`, `CM_SITE_SIMONE_USER`, `CM_SITE_SIMONE_PASSWORD`
- `dev`, `staging` and `prod`: `FLUENTCRM_URL`, `FLUENTCRM_USER`, `FLUENTCRM_APP_PASSWORD`, `FLUENTCRM_LIST_ID` (`1`, "Newsletter"), `NEWSLETTER_WEBHOOK_SECRET`. The prod values are also set on the Vercel project.
- The database password is the one Coolify generated for the service (service → Environment Variables).

## Build steps

These are the steps that set up the install. Run the Coolify CLI from PowerShell (Git Bash rewrites leading-slash arguments).

1. **DNS.** In Cloudflare, zone `otakusolutions.io`, add an `A` record: name `culturedmatter`, content `191.101.15.236`, proxy status **DNS only** (grey cloud), so Traefik can complete the Let's Encrypt HTTP-01 challenge. The zone has no wildcard record.
2. **Service** (in the existing "Otaku Solutions" project):
   ```powershell
   coolify service create wordpress-with-mariadb --server-uuid=sq3c52uczu81384adrlo7w77 `
     --project-uuid=v11kpx15vw3l3pzs8csucps8 --environment-name=production --name="cultured-matter-site"
   coolify service application update <service uuid> <wordpress app uuid> --url "https://culturedmatter.otakusolutions.io"
   coolify service start <service uuid>
   ```
3. **Install.** Run the WordPress installer straight away (`/wp-admin/install.php`), because until then anyone can claim the site. Admin user `otaku-admin`, owner email, generated password stored in Infisical; "Discourage search engines" ticked.
4. **WP-CLI.** `wordpress:latest` has no `wp` binary. Download the phar into the container's `/tmp` (it is gone after a restart, which is fine) and run it as `www-data`:
   ```sh
   WP=wordpress-<service uuid>
   docker exec -u www-data "$WP" sh -c 'cd /tmp && curl -sSLo wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'
   docker exec -u www-data "$WP" php /tmp/wp --path=/var/www/html <command>
   ```
5. **Settings and plugins.**
   ```sh
   wp rewrite structure '/%postname%/' --hard
   wp plugin delete akismet hello
   wp plugin install fluent-crm fluent-security --activate
   wp eval '$l = \FluentCrm\App\Models\Lists::firstOrCreate(["slug"=>"newsletter"],["title"=>"Newsletter"]); echo $l->id;'
   ```
6. **App connection.** `wp user application-password create otaku-admin cultured-matter-os --porcelain` prints the password once. Pipe it straight into `infisical secrets set` (never print it), with the list ID as `FLUENTCRM_LIST_ID`. Copy the prod values to Vercel and redeploy. Details: `docs/newsletter.md`.
7. **Simone's login.** `wp user create simone simone@simonepaz.com --role=editor --user_pass=<generated>` (no email is sent). Store the password in Infisical and give it to her directly. Add her in FluentCRM → Settings → Managers for CRM access.
8. **Unsubscribe webhook.** Needs FluentCRM Pro (automations). Point it at a stable app URL only. Vercel preview URLs change per deployment and sit behind deployment protection, so a webhook aimed at one breaks. Full setup: `docs/newsletter.md`, step 4.

## Backups

| What                      | How                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files (`wordpress-files`) | Coolify volume backup, daily `0 3 * * *`, keep 7 locally: `coolify service storage set-backup <service uuid> <storage uuid> --frequency "0 3 * * *" --retention-amount-locally 7`.                 |
| Database (`mariadb-data`) | Coolify volume backup, daily `15 3 * * *`, keep 7 locally, with `--stop-during-backup` so the copy is consistent (MariaDB pauses for a few seconds). For a SQL dump instead, use the export below. |
| Off-server copy           | None yet. Both backups stay on the same VPS. Add an S3 destination (`coolify s3 create`) and set `save_s3` on both schedules before the site holds real data.                                      |

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

# Self-hosting Cultured Matter OS

This guide sets up your own copy of Cultured Matter OS: the Next.js app, its database, Google
sign-in, and the agent server behind the chat. The production copy runs the app on Vercel, the
database on Turso and the agent server in Docker under Coolify on a VPS, and this guide follows
that layout. Other hosts work too; where they differ, the step says what changes.

Never commit real values. Keep them in a secrets manager (the maintainers use Infisical) or in the
host's environment settings, and only in `.env.local` on your own machine.

## What you will run

| Part | Needed for | Where it runs here |
| --- | --- | --- |
| The app (this repo) | Everything | Vercel |
| libSQL database | Everything | Turso |
| Google OAuth client | Sign-in, Gmail, Contacts, the daily summary | Google Cloud |
| Agent server (`agent/packages/server`) | The chat, and the scheduled Radar, grants, page-monitor and Gmail jobs | Docker on a VPS (Coolify) |
| A model provider | The chat, grant drafts, the voice guide | Vercel AI Gateway or a provider key |
| Vercel Blob store | Photos from the iPhone Shortcut | Vercel |
| Firecrawl | Page monitors, reading grant documents, the assistant's web search | firecrawl.dev |
| WordPress with FluentCRM | The newsletter | Any WordPress host ([newsletter.md](newsletter.md)) |

Only the first three are required to sign in and use the core pages. Each of the others turns on
one feature, and the app says on the page when a feature is not connected yet.

## 1. Database (Turso)

1. Install the [Turso CLI](https://docs.turso.tech/cli/introduction) and sign in.
2. Create a database and a token:

   ```bash
   turso db create cultured-matter-os
   turso db show cultured-matter-os --url        # TURSO_DATABASE_URL (libsql://...)
   turso db tokens create cultured-matter-os     # TURSO_AUTH_TOKEN
   ```

3. Apply the migrations from your machine, with those two values in the environment:

   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate
   ```

   Run this again after every update that adds a file to `db/migrations`, **before** the new code
   is deployed. Builds do not migrate.

Any libSQL server works in place of Turso (`sqld`, or a `file:` URL on a host with a persistent
disk). Leave `TURSO_AUTH_TOKEN` unset when the server needs none.

## 2. Google sign-in

Sign-in is Google only, and the same Google account is the one Gmail, Contacts and the daily
summary use (`lib/auth.ts`, `lib/google-scopes.ts`).

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library**: enable the **Gmail API** and the **People API**.
3. **OAuth consent screen**: if the owner's address is on Google Workspace, create the OAuth
   client inside that Workspace and choose the **Internal** user type, so only that organisation's
   accounts can use it and no app verification is needed. Otherwise choose **External** and add the
   owner as a test user. Google's rules for External apps in "Testing" include refresh tokens that
   expire after 7 days, which would stop the hourly Gmail check until she signs in again; check
   Google's current [OAuth policies](https://support.google.com/cloud/answer/10311615) before you
   rely on that setup.
4. Add these scopes (on top of `openid`, `email` and `profile`):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/contacts.other.readonly`
5. **Credentials → Create credentials → OAuth client ID**, type **Web application**. Authorised
   redirect URIs: `https://<your app domain>/api/auth/callback/google`, plus
   `http://localhost:3000/api/auth/callback/google` for local development.
6. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Only addresses in `ALLOWED_EMAILS` can sign in. `OWNER_EMAIL` names the one whose Google account
the app reads and mails; others on the list can sign in without taking over her mailbox.

## 3. Deploy the app

### On Vercel

1. Import the repository as a Vercel project. The framework preset (Next.js) and the default
   build command are right as they are.
2. Set the environment variables from the reference below for **Production** (and Preview if you
   use previews).
3. **Storage → Blob**: create a **private** Blob store and connect it to the project. That sets
   `BLOB_READ_WRITE_TOKEN`.
4. Set `CRON_SECRET` to a long random string. Vercel then sends it with the daily summary cron in
   `vercel.json` (`/api/cron/daily-summary`, 14:00 UTC). The free Hobby plan allows this one daily
   cron; every other scheduled job runs on the agent server.
5. Deploy, then add your domain and set `BETTER_AUTH_URL` to it (with `https://`, no trailing
   slash) and redeploy.

On Vercel the AI calls made by the app itself (grant drafts, the voice guide) use the Vercel AI
Gateway with the project's own OIDC token, so no model key is needed there.

### On any other Node.js host

```bash
npm ci
npm run build
npm start          # listens on $PORT, default 3000
```

Run it behind HTTPS. Then, compared with Vercel:

- **Daily summary**: call it yourself once a day, for example from cron:
  `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your app domain>/api/cron/daily-summary`.
- **AI calls in the app** need `AI_GATEWAY_API_KEY` (a Vercel AI Gateway key), because there is no
  Vercel OIDC token.
- **Photos** still use Vercel Blob (`lib/capture.ts`): create a Blob store in a Vercel account and
  copy its `BLOB_READ_WRITE_TOKEN`, or leave photo capture off.
- **`OWNER_EMAIL`** must be set. The built-in default only applies when `VERCEL_ENV=production`.
- Some routes allow up to 300 seconds (grant drafts, ingestion jobs). Make sure your proxy's
  timeouts allow that.

## 4. Deploy the agent server

The agent server is [mastra-chat-kit](https://github.com/hamchowderr/mastra-chat-kit) in `agent/`,
with Cultured Matter's tools and instructions added (see [agent/README.md](../agent/README.md)). It
is a separate service with its own package manager (pnpm) and its own image:
`agent/packages/server/Dockerfile`, built with **`agent/`** as the build context.

```bash
cd agent
docker build -f packages/server/Dockerfile -t cultured-matter-agent .
docker run -d --name cultured-matter-agent -p 4111:4111 --env-file packages/server/.env \
  -v cm-agent-data:/app/data -e TURSO_DATABASE_URL=file:/app/data/mastra.db cultured-matter-agent
```

On Coolify, create an application from this repository with the Dockerfile build pack, base
directory `/agent`, Dockerfile `packages/server/Dockerfile`, port 4111, a domain with HTTPS, and
the variables below. `agent/packages/server/docker-compose.yml` is the kit's full stack (it adds a
Dolt database for the `data` subagent, which Cultured Matter does not use).

Things to get right:

- **Run exactly one instance.** Each instance runs Mastra's scheduler, and two would fire every
  scheduled job twice.
- **Persistent storage.** Threads, memory and schedules live in libSQL. Either mount a volume at
  `/app/data` and set `TURSO_DATABASE_URL=file:/app/data/mastra.db`, or point it at its own Turso
  database. Do not share the app's database.
- **Set `MASTRA_JWT_SECRET`.** Without it every route and the bundled Studio are open to anyone who
  finds the address.

Agent server settings (full list with comments: `agent/packages/server/.env.example`):

| Variable | Value |
| --- | --- |
| `APP_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
| `MASTRA_JWT_SECRET` | 32+ random characters, the **same** value as the app's `MASTRA_JWT_SECRET` |
| `AGENT_SERVICE_TOKEN` | A long random key, the **same** value as the app's `AGENT_SERVICE_TOKEN` |
| `CMOS_APP_URL` | The app's address, e.g. `https://<your app domain>` |
| Model access | `AI_GATEWAY_API_KEY` with `CHAT_MODEL=vercel/anthropic/...`, or `ANTHROPIC_API_KEY` with `CHAT_MODEL=anthropic/...` |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Its storage (see above) |
| `DEFAULT_TIMEZONE` | Her IANA time zone, e.g. `America/New_York`, for scheduled runs |
| `FIRECRAWL_API_KEY` | Optional: the assistant's web search |
| `WORDPRESS_URL`, `WORDPRESS_MCP_USER`, `WORDPRESS_MCP_APP_PASSWORD` | Optional: FluentCRM, Fluent Forms and Fluent Booking tools, through a WordPress user with its own application password |

Cultured Matter runs the kit with its coding features off. Set:

```
WORKSPACE_SANDBOX=false
WORKSPACE_BROWSER=false
SUBAGENT_CODE=false
SUBAGENT_RESEARCH=false
SUBAGENT_REVIEW=false
SUBAGENT_DATA=false
SUBAGENT_WRITER=true
TOOL_GENERATE_IMAGE=false
TOOL_DEMO=false
```

When it is up, set the app's `MASTRA_SERVER_URL` to the agent server's address and redeploy the
app. The Chat page appears once that is set. The agent server reads the app's actions from
`{CMOS_APP_URL}/api/agent/actions` when it starts, so start (or restart) it after the app is live.

Its schedules (UTC): Radar 11:00, grants 11:30, page monitors 12:00, the Gmail reply check at half
past every hour. They call the app's `/api/agent/jobs/*` with `AGENT_SERVICE_TOKEN`. Run history is
in the Studio at the agent server's address.

## 5. App settings reference

Every name the app reads, grouped by feature. `.env.example` has the same list with comments.

**Required**

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | From step 1. Unset = `./local.db` |
| `BETTER_AUTH_SECRET` | 32+ random characters (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | The app's public address, e.g. `https://app.example.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 2 |
| `ALLOWED_EMAILS` | Comma-separated Google addresses that may sign in. Empty refuses everyone |
| `OWNER_EMAIL` | The owner, one of `ALLOWED_EMAILS` |

**Assistant and scheduled jobs**

| Variable | Value |
| --- | --- |
| `MASTRA_SERVER_URL` | The agent server's address. Unset hides the chat (except under `npm run dev`, which uses `http://localhost:4111`) |
| `MASTRA_JWT_SECRET` | Shared with the agent server |
| `AGENT_SERVICE_TOKEN` | Shared with the agent server. Unset closes `/api/agent/actions` and `/api/agent/jobs/*` |
| `AI_GATEWAY_API_KEY` | Only off Vercel: the app's own AI calls |
| `FIRECRAWL_API_KEY` | Page monitors and reading grant links and uploads. Unset: pasting grant text still works, and page-monitor runs fail |

**Daily summary**

| Variable | Value |
| --- | --- |
| `CRON_SECRET` | Guards `/api/cron/daily-summary` |
| `EMAIL_TRANSPORT` | Empty: sent from the owner's Gmail to herself. `resend`: through Resend, for testing |
| `RESEND_API_KEY`, `EMAIL_FROM` | Only with `EMAIL_TRANSPORT=resend`; `EMAIL_FROM` on a domain verified in Resend |

**Capture (iPhone and Apple Notes)**

| Variable | Value |
| --- | --- |
| `CAPTURE_TOKEN` | A long random key the Shortcuts send. See [iphone-shortcut.md](iphone-shortcut.md) |
| `BLOB_READ_WRITE_TOKEN` | A private Vercel Blob store, for photos |

**Push notifications**

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | From `npx web-push generate-vapid-keys` (once) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The same public key. It is built into the client, so redeploy after changing it |
| `VAPID_SUBJECT` | A `mailto:` address or the app's URL. Default: `BETTER_AUTH_URL` |

**Newsletter** (setup in [newsletter.md](newsletter.md))

| Variable | Value |
| --- | --- |
| `FLUENTCRM_URL`, `FLUENTCRM_USER`, `FLUENTCRM_APP_PASSWORD` | The WordPress site, a user and one of its application passwords |
| `FLUENTCRM_LIST_ID` | The FluentCRM list the app syncs |
| `NEWSLETTER_WEBHOOK_SECRET` | 16+ characters, shared with FluentCRM's unsubscribe webhook |

## 6. First sign-in

1. Open the app and sign in with the owner's Google account. Google asks for Gmail and Contacts
   access; accept it.
2. Today shows a **Get started** checklist: Sync Google, add the iPhone Shortcuts, bring in
   LinkedIn contacts.
3. Optional: fill **Settings → Business** (grant drafts use it), or seed it once with
   `npm run seed:business` against the database. The seed is Cultured Matter's own profile
   (`lib/business-seed.ts`), so edit it first for anyone else.
4. To fill Radar and Grants without waiting for the morning schedule, run
   `npm run ingest:radar` and `npm run ingest:grants` with the database settings in the
   environment, or trigger the workflows from the agent server's Studio.

## Things written for Cultured Matter

A copy for someone else should change these, which are in the code rather than in settings:

- `app/(app)/inbox/iphone-panel.tsx`: `CAPTURE_URL`, the capture address shown to the Shortcuts.
- `components/layout/sidebar/nav-main.tsx`: the sidebar's website and WordPress links.
- `lib/allowed-emails.ts`: `DEFAULT_OWNER_EMAIL`, used when `OWNER_EMAIL` is unset on Vercel
  production.
- `lib/business-seed.ts`: the business profile seed.
- `agent/packages/server/src/mastra/agents/chat.ts`: the assistant's instructions.
- `ingest/radar`, `ingest/grants`, `ingest/monitors`: which feeds, grant programmes and pages are
  watched.

## Updating

1. Pull the new code.
2. If `db/migrations` changed, run `npm run db:migrate` against the production database first.
3. Deploy the app (on Vercel, merging to `main` does it).
4. If `agent/` changed, redeploy the agent server. Kit updates come in with
   `git subtree pull --prefix=agent https://github.com/hamchowderr/mastra-chat-kit.git main --squash`.

## Backups

The app's data is all in its database, apart from photos in Blob. Turso keeps its own history
depending on your plan; for a copy you hold yourself, `turso db shell <database> .dump > backup.sql`.

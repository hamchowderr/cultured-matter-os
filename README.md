# Cultured Matter OS

Cultured Matter OS is a private workspace for one business owner: her tasks, contacts, grants, startup
radar and newsletter list in one app, with an assistant that can read and act on all of it. It is a
Next.js app on a libSQL (Turso) database, signed in with Google, plus a separate Mastra agent server
for the chat assistant and the scheduled data pulls.

To run your own copy, see **[docs/self-hosting.md](docs/self-hosting.md)**.

## What is in the app

Every page needs a Google sign-in from an address in `ALLOWED_EMAILS`. `/` redirects to `/today`.

| Page | What it does |
| --- | --- |
| Today (`/today`) | The day at a glance: tasks, actions waiting for her approval, new Radar finds, counts, and a first-run "Get started" checklist. |
| Chat (`/chat`) | The assistant. Hidden when no agent server is configured (see below). |
| Inbox (`/inbox`) | Quick captures (typed, from the iPhone Shortcuts, or from Apple Notes) to file as a task, idea or reference. |
| Projects (`/projects`) | Projects and their tasks. |
| People (`/people`) | Contacts from Google Contacts, Gmail and a LinkedIn `Connections.csv` export; reply tracking; newsletter list. |
| Radar (`/radar`) | Early-stage climate and materials startups pulled daily from free feeds (`ingest/radar`). |
| Grants (`/grants`) | Grant opportunities by deadline (`ingest/grants`), a calendar view with a private `.ics` feed, and AI-drafted applications. |
| Map (`/map`) | A live map of projects, tasks, people, Radar, grants and ideas, with saved maps. |
| Archive (`/archive`) | A timeline of everything done, plus notes. |
| Settings (`/settings`) | Google connection, daily summary email, push notifications, the grants calendar feed, the business profile and her writing-voice guide. |

The app is also a PWA (`public/sw.js`, `app/manifest.ts`) with web push notifications and a daily
summary email.

## How it fits together

```
Browser / iPhone ──► Next.js app (this repo, Vercel) ──► Turso (libSQL)
                       │   ▲                         ──► Vercel Blob (captured photos)
                       │   │ actions + ingestion jobs ──► Google (sign-in, Gmail, Contacts)
                       ▼   │ (AGENT_SERVICE_TOKEN)    ──► FluentCRM on WordPress (newsletter)
                     Agent server (agent/, Docker) ──► model provider, Firecrawl, WordPress MCP
```

- **App** (`app/`, `actions/`, `lib/`, `db/`): Next.js 16 App Router, React 19, Tailwind 4,
  shadcn/ui. Data goes through Drizzle ORM to libSQL: a local `local.db` file in development, Turso
  when deployed. Sign-in is Better Auth with Google only (`lib/auth.ts`); `proxy.ts` sends anyone
  without a session to `/sign-in`.
- **Server actions** (`actions/`) are the app's only write path. The same named actions are
  exposed to the assistant as tools through `/api/agent/actions` (`lib/agent-actions.ts`).
- **Agent server** (`agent/`): [mastra-chat-kit](https://github.com/hamchowderr/mastra-chat-kit)
  brought in as a git subtree, with Cultured Matter's tools and instructions. Only
  `agent/packages/server` is deployed (Docker). The app's `/api/agent-controller/*` routes proxy
  the chat to it, signed with `MASTRA_JWT_SECRET`. See [agent/README.md](agent/README.md).
- **Scheduled work.** One Vercel cron, the daily summary (`vercel.json`,
  `/api/cron/daily-summary`, 14:00 UTC). Everything else runs on the agent server's scheduler and
  calls back into the app at `/api/agent/jobs/*`: Radar 11:00, grants 11:30, page monitors 12:00
  (UTC, `agent/packages/server/src/mastra/workflows/ingest.ts`) and the Gmail reply check at half
  past every hour (`workflows/gmail.ts`).
- **Newsletter**: the app keeps the list and syncs it to FluentCRM on WordPress, which sends the
  mail. See [docs/newsletter.md](docs/newsletter.md).

## Run it locally

Needs Node.js 22 or later (CI uses 24) and npm.

```bash
npm ci
cp .env.example .env.local      # then fill in what you need (below)
npm run db:migrate              # creates ./local.db with no TURSO_DATABASE_URL set
npm run dev                     # http://localhost:3000
```

The minimum to sign in locally:

- `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL=http://localhost:3000`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from a Google OAuth client with
  `http://localhost:3000/api/auth/callback/google` as a redirect URI.
- `ALLOWED_EMAILS` with your Google address.

Leave `TURSO_DATABASE_URL` unset to use `./local.db`. Every other setting turns one feature on and
the app says so where a feature is not connected. [docs/self-hosting.md](docs/self-hosting.md)
lists them all.

**The assistant locally.** Under `npm run dev` the chat talks to `http://localhost:4111` unless
`MASTRA_SERVER_URL` says otherwise. Start the agent server from `agent/` (it uses pnpm, not npm):

```bash
cd agent && pnpm install
cp packages/server/.env.example packages/server/.env   # APP_SECRET + a model key at minimum
pnpm --filter @mastra-chat-kit/server dev
```

Set the same `MASTRA_JWT_SECRET` and `AGENT_SERVICE_TOKEN` in both, and `CMOS_APP_URL=http://localhost:3000`
on the agent side, to give the assistant the app's tools.

**Secrets.** The maintainers keep every value in [Infisical](https://infisical.com) and run with
`infisical run --path=/cultured-matter-os -- npm run dev` instead of a `.env.local`. Either works.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm test` | Vitest. Each test file migrates its own temporary libSQL database; no network or secrets. |
| `npm run db:generate` | New migration in `db/migrations` from changes to `db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `TURSO_DATABASE_URL` (or `./local.db`) |
| `npm run db:studio` | Drizzle Studio |
| `npm run ingest:radar` / `ingest:grants` / `ingest:monitors` | Run one ingestion pipeline by hand against the configured database |
| `npm run seed:business` | Seed the business profile used by grant drafts and the Map |

CI (`.github/workflows/ci.yml`) runs `npm ci`, the typecheck, lint and tests on every pull request.

## Repository layout

| Path | What is there |
| --- | --- |
| `app/(app)/` | The signed-in pages listed above |
| `app/api/` | Route handlers: auth, cron, capture, Apple Notes import, newsletter signup and webhook, calendar feed, photos, the agent's actions and jobs, and the chat proxy |
| `actions/` | Server actions, one file per area; `define.ts` is the wrapper that checks the session |
| `db/` | Drizzle schema and SQL migrations |
| `lib/` | Shared logic: auth, Google, Gmail sync, FluentCRM, push, daily summary, grant drafting |
| `ingest/` | Radar feeds, grant sources and page monitors |
| `components/` | UI: shadcn/ui in `ui/`, the chat in `chat/` and `ai-elements/`, layout and sidebar |
| `agent/` | The Mastra agent server (git subtree of mastra-chat-kit) |
| `scripts/` | The ingestion and seed scripts, plus AIMock and Firecrawl mocks for tests |
| `tests/` | Vitest suites |
| `docs/` | Runbooks (below) |

## Docs

- [Self-hosting](docs/self-hosting.md): every service, setting and step to run your own copy.
- [Newsletter](docs/newsletter.md): the FluentCRM sync and sending through FluentSMTP and toSend.
- [iPhone Shortcut](docs/iphone-shortcut.md) and [Apple Notes Shortcut](docs/apple-notes-shortcut.md):
  capture into the Inbox.
- [Website handover](docs/website-handover.md): the WordPress and FluentCRM install.

Work is tracked with [beads](https://github.com/gastownhall/beads) (`bd ready`); see `AGENTS.md`.

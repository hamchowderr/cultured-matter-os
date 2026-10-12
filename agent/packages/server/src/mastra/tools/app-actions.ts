import type { ToolCategory } from '@mastra/core/agent-controller';
import { createTool } from '@mastra/core/tools';
import { env } from '../../lib/env';

/**
 * # Cultured Matter app actions as tools
 *
 * The Cultured Matter OS app owns its actions: each is a named zod schema plus a
 * handler. The app publishes them at `GET /api/agent/actions` (name, description,
 * read/write kind, and the input as JSON Schema) and runs one at
 * `POST /api/agent/actions/:name`, both behind the shared `AGENT_SERVICE_TOKEN`.
 *
 * This module turns that list into Mastra tools, so no schema is written twice. The
 * app validates every input again with its own zod schema before running anything.
 *
 * Approvals are the AgentController's. Read actions are granted for the session
 * (`readActionNames()` → `session.grantTool`), so they run straight away. Write
 * actions are left gated, so each one stops at the chat's approval card and only
 * reaches the app after Simone approves it.
 */

export type AppAction = {
  name: string;
  description: string;
  kind: 'read' | 'write';
  inputSchema: Record<string, unknown>;
};

type Fetch = typeof fetch;

export type AppActionsConfig = {
  appUrl: string;
  token: string;
  fetch?: Fetch;
};

/** Called after an app action the model ran succeeded (e.g. to drop a cached read). */
type AfterActionListener = (name: string) => void;
const afterActionListeners = new Set<AfterActionListener>();

/** Be told when an app action run by the model succeeds. Returns an unsubscribe. */
export function onAppActionDone(listener: AfterActionListener): () => void {
  afterActionListeners.add(listener);
  return () => afterActionListeners.delete(listener);
}

/**
 * Writes that ask every time, even after an "Always allow": ones that remove something, and
 * draftGrantApplication, which spends Firecrawl credits and an AI call and replaces her answers.
 */
const ALWAYS_ASK = new Set(['deleteProject', 'draftGrantApplication']);

function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

/** Read the action list from the app. Throws when the app can't be reached. */
export async function fetchAppActions({
  appUrl,
  token,
  fetch: f = fetch,
}: AppActionsConfig): Promise<AppAction[]> {
  const res = await f(`${appUrl.replace(/\/$/, '')}/api/agent/actions`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`app action list failed: ${res.status}`);
  const body = (await res.json()) as { actions?: AppAction[] };
  return body.actions ?? [];
}

/** One Mastra tool per app action. Each call runs the action through the app. */
export function buildAppActionTools(actions: AppAction[], config: AppActionsConfig) {
  const f = config.fetch ?? fetch;
  const base = config.appUrl.replace(/\/$/, '');
  return Object.fromEntries(
    actions.map((action) => [
      action.name,
      createTool({
        id: action.name,
        description: action.description,
        inputSchema: action.inputSchema,
        execute: async (input) => {
          const res = await f(`${base}/api/agent/actions/${encodeURIComponent(action.name)}`, {
            method: 'POST',
            headers: headers(config.token),
            body: JSON.stringify(input ?? {}),
          });
          const body = (await res.json().catch(() => null)) as
            | { ok: true; data: unknown }
            | { ok: false; error: { code: string; message: string } }
            | null;
          if (!body) throw new Error(`${action.name} failed: ${res.status}`);
          // The model reads the app's own message ("No such project", "Invalid input") and
          // can tell the user plainly.
          if (!body.ok) return { error: body.error };
          for (const listener of afterActionListeners) listener(action.name);
          return body.data;
        },
      }),
    ]),
  );
}

let config: AppActionsConfig | null =
  env.CMOS_APP_URL && env.AGENT_SERVICE_TOKEN
    ? { appUrl: env.CMOS_APP_URL, token: env.AGENT_SERVICE_TOKEN }
    : null;
let loaded: AppAction[] = [];
let loading: Promise<AppAction[]> | null = null;

/**
 * Point the tools at an app. The server reads `CMOS_APP_URL` and `AGENT_SERVICE_TOKEN`
 * from env; tests point it at a fake app with a stub `fetch`.
 */
export function configureAppActions(next: AppActionsConfig | null) {
  config = next;
  loaded = [];
  loading = null;
}

/**
 * Load the app's actions once. Called at boot (index.ts) and again on a request if
 * boot could not reach the app, so a server that starts before the app still gets
 * its tools. Unconfigured (no `CMOS_APP_URL` / `AGENT_SERVICE_TOKEN`), there are none.
 */
export function loadAppActions(): Promise<AppAction[]> {
  if (loaded.length) return Promise.resolve(loaded);
  const current = config;
  if (!current) return Promise.resolve([]);
  loading ??= fetchAppActions(current)
    .then((actions) => {
      loaded = actions;
      return actions;
    })
    .catch((e) => {
      console.warn(`Cultured Matter app actions unavailable: ${(e as Error).message}`);
      return [];
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * Run one app action directly (not as a model tool), e.g. the reads behind the per-turn
 * business context (lib/business-context.ts). Returns the action's data; throws when the
 * app is not configured, can't be reached in time, or refuses.
 */
export async function runAppAction(
  name: string,
  input: Record<string, unknown> = {},
  { timeoutMs = 3_000 }: { timeoutMs?: number } = {},
): Promise<unknown> {
  const current = config;
  if (!current) throw new Error('the app is not configured');
  const f = current.fetch ?? fetch;
  const res = await f(
    `${current.appUrl.replace(/\/$/, '')}/api/agent/actions/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: headers(current.token),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: unknown }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body) throw new Error(`${name} failed: ${res.status}`);
  if (!body.ok) throw new Error(`${name}: ${body.error.message}`);
  return body.data;
}

/** True when the server knows where the app is and how to authenticate to it. */
export function appConfigured(): boolean {
  return config !== null;
}

/**
 * Run one of the app's scheduled jobs (`POST /api/agent/jobs/:name`, the app's
 * lib/agent-jobs.ts): the ingestion workflows' calls. Not model tools. Same token as the
 * actions. Returns the job's data; throws when the app is not configured, can't be reached,
 * times out or refuses, so the workflow step that called it retries.
 */
export async function runAppJob(
  name: string,
  input: Record<string, unknown>,
  // One monitored page's Firecrawl scrape can take minutes; the app's route allows 300 s.
  { timeoutMs = 320_000 }: { timeoutMs?: number } = {},
): Promise<unknown> {
  const current = config;
  if (!current) throw new Error('the app is not configured (CMOS_APP_URL, AGENT_SERVICE_TOKEN)');
  const f = current.fetch ?? fetch;
  const res = await f(
    `${current.appUrl.replace(/\/$/, '')}/api/agent/jobs/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: headers(current.token),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: unknown }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body) throw new Error(`${name} failed: ${res.status}`);
  if (!body.ok) throw new Error(`${name}: ${body.error?.message ?? res.status}`);
  return body.data;
}

/** The chat agent's app tools, loading them if boot couldn't. */
export async function getAppActionTools() {
  const actions = await loadAppActions();
  return config ? buildAppActionTools(actions, config) : {};
}

/** Read actions run without an approval card: the session grants them. */
export function readActionNames(): string[] {
  return loaded.filter((a) => a.kind === 'read').map((a) => a.name);
}

/**
 * The approval category for an app action, for the controller's
 * `toolCategoryResolver`: reads are `read`, writes are `edit`, and removals resolve
 * to `null` so "Always allow" approves just that one call.
 */
export function appActionCategory(name: string): ToolCategory | null {
  const action = loaded.find((a) => a.name === name);
  if (!action || ALWAYS_ASK.has(name)) return null;
  return action.kind === 'read' ? 'read' : 'edit';
}

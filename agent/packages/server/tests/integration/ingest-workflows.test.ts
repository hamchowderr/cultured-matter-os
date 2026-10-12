import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureAppActions } from '../../src/mastra/tools/app-actions';
import {
  createIngestWorkflow,
  type Pipeline,
  SOURCE_RETRIES,
} from '../../src/mastra/workflows/ingest';

/**
 * The ingestion workflows (src/mastra/workflows/ingest.ts) against a fake Cultured Matter
 * app: every call to /api/agent/jobs/* is answered by a stub fetch, so nothing leaves the
 * process and no model is called. The workflows are built WITH a schedule (a cron that
 * never comes round in a test run) so they run on the evented engine a scheduled workflow
 * is promoted to in production, on a real libSQL store.
 */

const NEVER = '0 0 1 1 *';
const APP = 'http://app.test';
const TOKEN = 'test-agent-service-token-0123456789';

type Call = { name: string; body: Record<string, unknown> };
type JobReply = (body: Record<string, unknown>, attempt: number) => Response;

/** A fake app: `listIngestSources` returns the given slugs; `ingestSource` asks `reply`. */
function fakeApp(slugs: string[], reply: JobReply) {
  const calls: Call[] = [];
  const attempts = new Map<string, number>();
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const name = url.pathname.split('/').pop() ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(url.origin).toBe(APP);
    expect(url.pathname.startsWith('/api/agent/jobs/')).toBe(true);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    calls.push({ name, body });
    if (name === 'listIngestSources') {
      return Response.json({
        ok: true,
        data: { sources: slugs.map((slug) => ({ slug, name: slug.toUpperCase() })) },
      });
    }
    const slug = String(body.slug);
    const n = (attempts.get(slug) ?? 0) + 1;
    attempts.set(slug, n);
    return reply(body, n);
  }) as typeof globalThis.fetch;
  return { fetch, calls, attempts };
}

const ok = (slug: string, created: number) =>
  Response.json({
    ok: true,
    data: { slug, ok: true, fetched: created, created, updated: 0, skipped: 0 },
  });
const sourceFailed = (slug: string, error: string) =>
  Response.json({ ok: true, data: { slug, ok: false, error } });

let dir: string;
let mastra: Mastra | undefined;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ingest-wf-'));
});
afterEach(async () => {
  await mastra?.shutdown();
  mastra = undefined;
  configureAppActions(null);
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
});

let dbN = 0;
async function run(pipeline: Pipeline, app: ReturnType<typeof fakeApp>, concurrency = 1) {
  configureAppActions({ appUrl: APP, token: TOKEN, fetch: app.fetch });
  const workflow = createIngestWorkflow({ pipeline, cron: NEVER, concurrency, retryDelayMs: 10 });
  const url = pathToFileURL(join(dir, `wf-${dbN++}.db`)).href;
  mastra = new Mastra({
    workflows: { [`ingest-${pipeline}`]: workflow },
    storage: new LibSQLStore({ id: `ingest-test-${dbN}`, url }),
  });
  // The server starts these at boot; a library-mode Mastra starts them here.
  await mastra.startWorkers();
  const wf = mastra.getWorkflow(`ingest-${pipeline}`);
  const r = await wf.createRun();
  const result = await r.start({ inputData: {} });
  return { result, runId: r.runId, wf };
}

describe('ingestion workflows', () => {
  it('registers a UTC schedule for each pipeline at the old Vercel cron times', async () => {
    const { ingestWorkflows } = await import('../../src/mastra/workflows/ingest');
    const url = pathToFileURL(join(dir, 'schedules.db')).href;
    mastra = new Mastra({
      workflows: ingestWorkflows,
      storage: new LibSQLStore({ id: 'ingest-schedules', url }),
    });
    await mastra.startWorkers();
    const rows = await mastra.schedules.list();
    expect(
      rows
        .map((r) => ({
          workflowId: 'workflowId' in r ? r.workflowId : undefined,
          cron: r.cron,
          timezone: r.timezone,
          status: r.status,
        }))
        .sort((a, b) => String(a.workflowId).localeCompare(String(b.workflowId))),
    ).toEqual([
      { workflowId: 'ingest-grants', cron: '30 11 * * *', timezone: 'UTC', status: 'active' },
      { workflowId: 'ingest-monitors', cron: '0 12 * * *', timezone: 'UTC', status: 'active' },
      { workflowId: 'ingest-radar', cron: '0 11 * * *', timezone: 'UTC', status: 'active' },
    ]);
  });

  it('runs every source the app lists, one step each, and sums what was created', async () => {
    const app = fakeApp(['sosv', 'yc', 'nsf'], (body) => ok(String(body.slug), 2));
    const { result } = await run('radar', app);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toMatchObject({ pipeline: 'radar', sources: 3, created: 6 });
    expect(app.calls.map((c) => c.name)).toEqual([
      'listIngestSources',
      'ingestSource',
      'ingestSource',
      'ingestSource',
    ]);
    expect(app.calls[0].body).toEqual({ pipeline: 'radar' });
    expect(app.calls.slice(1).map((c) => c.body)).toEqual([
      { pipeline: 'radar', slug: 'sosv' },
      { pipeline: 'radar', slug: 'yc' },
      { pipeline: 'radar', slug: 'nsf' },
    ]);
  });

  it('retries a failing source alone and succeeds when it recovers', async () => {
    // yc fails its first attempt (the site was down), then works.
    const app = fakeApp(['sosv', 'yc', 'nsf'], (body, attempt) => {
      const slug = String(body.slug);
      return slug === 'yc' && attempt === 1 ? sourceFailed(slug, '503 from yc') : ok(slug, 1);
    });
    const { result } = await run('radar', app);
    expect(result.status).toBe('success');
    expect(app.attempts.get('yc')).toBe(2);
    expect(app.attempts.get('sosv')).toBe(1);
    expect(app.attempts.get('nsf')).toBe(1);
  });

  it('keeps going past a source that never recovers, then fails the run naming it', async () => {
    const app = fakeApp(['sosv', 'yc', 'nsf'], (body) => {
      const slug = String(body.slug);
      return slug === 'yc' ? sourceFailed(slug, '503 from yc') : ok(slug, 1);
    });
    const { result } = await run('radar', app);
    // Every source ran; yc got its retries and no more.
    expect(app.attempts.get('yc')).toBe(SOURCE_RETRIES + 1);
    expect(app.attempts.get('sosv')).toBe(1);
    expect(app.attempts.get('nsf')).toBe(1);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(String(result.error?.message ?? result.error)).toMatch(
      /1 of 3 radar sources failed: yc \(503 from yc\)/,
    );
    // The per-source outcomes stay on the run for Studio.
    const loop = result.steps['ingest-source'];
    expect(loop.status).toBe('success');
    expect(loop.status === 'success' && loop.output).toEqual([
      expect.objectContaining({ slug: 'sosv', ok: true }),
      { slug: 'yc', ok: false, error: '503 from yc' },
      expect.objectContaining({ slug: 'nsf', ok: true }),
    ]);
  });

  it('retries a source when the app itself errors or is unreachable', async () => {
    const app = fakeApp(['fc-epa-sbir'], (body, attempt) =>
      attempt < 3
        ? Response.json(
            { ok: false, error: { code: 'internal', message: 'boom' } },
            { status: 500 },
          )
        : ok(String(body.slug), 9),
    );
    const { result } = await run('monitors', app);
    expect(result.status).toBe('success');
    expect(app.attempts.get('fc-epa-sbir')).toBe(3);
  });

  it('succeeds with nothing to do when no monitor page is due', async () => {
    const app = fakeApp([], () => {
      throw new Error('no source should run');
    });
    const { result } = await run('monitors', app);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toEqual({ pipeline: 'monitors', sources: 0, created: 0, results: [] });
  });

  it('keeps the run in storage so its history can be read back', async () => {
    const app = fakeApp(['grants-gov', 'ca-grants'], (body) => ok(String(body.slug), 3));
    const { result, runId, wf } = await run('grants', app, 2);
    expect(result.status).toBe('success');
    const stored = await wf.getWorkflowRunById(runId);
    expect(stored?.status).toBe('success');
  });
});

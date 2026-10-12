import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureAppActions } from '../../src/mastra/tools/app-actions';
import { CHECK_RETRIES, createGmailReplyWorkflow } from '../../src/mastra/workflows/gmail';

/**
 * The hourly Gmail reply check (src/mastra/workflows/gmail.ts) against a fake Cultured
 * Matter app that answers /api/agent/jobs/gmailReplyCheck, so nothing leaves the process.
 * Built with a schedule that never comes round, so it runs on the evented engine a
 * scheduled workflow uses in production, on a real libSQL store.
 */

const NEVER = '0 0 1 1 *';
const APP = 'http://app.test';
const TOKEN = 'test-agent-service-token-0123456789';

function fakeApp(reply: (attempt: number) => Response) {
  let attempts = 0;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(APP);
    expect(url.pathname).toBe('/api/agent/jobs/gmailReplyCheck');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init?.body))).toEqual({});
    attempts++;
    return reply(attempts);
  }) as typeof globalThis.fetch;
  return { fetch, attempts: () => attempts };
}

let dir: string;
let mastra: Mastra | undefined;
let dbN = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gmail-wf-'));
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

async function run(app: ReturnType<typeof fakeApp>) {
  configureAppActions({ appUrl: APP, token: TOKEN, fetch: app.fetch });
  const workflow = createGmailReplyWorkflow({ cron: NEVER, retryDelayMs: 10 });
  const url = pathToFileURL(join(dir, `wf-${dbN++}.db`)).href;
  mastra = new Mastra({
    workflows: { 'gmail-reply-check': workflow },
    storage: new LibSQLStore({ id: `gmail-test-${dbN}`, url }),
  });
  await mastra.startWorkers();
  const r = await mastra.getWorkflow('gmail-reply-check').createRun();
  return r.start({ inputData: {} });
}

describe('gmail reply check workflow', () => {
  it('registers an hourly UTC schedule at half past, as the Vercel cron ran', async () => {
    const { gmailReplyWorkflow } = await import('../../src/mastra/workflows/gmail');
    const url = pathToFileURL(join(dir, 'schedules.db')).href;
    mastra = new Mastra({
      workflows: { 'gmail-reply-check': gmailReplyWorkflow },
      storage: new LibSQLStore({ id: 'gmail-schedules', url }),
    });
    await mastra.startWorkers();
    const rows = await mastra.schedules.list();
    expect(
      rows.map((r) => ({
        workflowId: 'workflowId' in r ? r.workflowId : undefined,
        cron: r.cron,
        timezone: r.timezone,
        status: r.status,
      })),
    ).toEqual([
      { workflowId: 'gmail-reply-check', cron: '30 * * * *', timezone: 'UTC', status: 'active' },
    ]);
  });

  it("runs the app's reply check once and keeps its counts", async () => {
    const app = fakeApp(() =>
      Response.json({ ok: true, data: { ok: true, checked: 4, replied: 1 } }),
    );
    const result = await run(app);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result).toEqual({ ok: true, checked: 4, replied: 1 });
    expect(app.attempts()).toBe(1);
  });

  it('retries a failed check and succeeds when it recovers', async () => {
    const app = fakeApp((n) =>
      n === 1
        ? Response.json({ ok: true, data: { ok: false, error: 'Reply check failed' } })
        : Response.json({ ok: true, data: { ok: true, checked: 1, replied: 0 } }),
    );
    const result = await run(app);
    expect(result.status).toBe('success');
    expect(app.attempts()).toBe(2);
  });

  it('fails the run after its retries when the check keeps failing', async () => {
    const app = fakeApp(() =>
      Response.json({ ok: false, error: { code: 'internal', message: 'boom' } }, { status: 500 }),
    );
    const result = await run(app);
    expect(result.status).toBe('failed');
    expect(app.attempts()).toBe(CHECK_RETRIES + 1);
  });
});

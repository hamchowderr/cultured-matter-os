import { afterEach, describe, expect, it } from 'vitest';
import { resolveToolCategory } from '../../src/mastra/lib/tool-categories';
import {
  type AppAction,
  buildAppActionTools,
  configureAppActions,
  getAppActionTools,
  readActionNames,
} from '../../src/mastra/tools/app-actions';
import { callTool } from '../helpers/call-tool';

const ACTIONS: AppAction[] = [
  {
    name: 'searchGrants',
    description: 'Search grants.',
    kind: 'read',
    inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'createTask',
    description: 'Create a task.',
    kind: 'write',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
    },
  },
  {
    name: 'deleteProject',
    description: 'Delete a project.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } },
  },
  {
    name: 'draftGrantApplication',
    description: 'Draft a grant application.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { grantId: { type: 'string' } } },
  },
];

/** A stand-in for the app: records each call and answers like the real endpoints. */
function fakeApp(reply: (name: string, body: unknown) => unknown = () => ({ ok: true, data: {} })) {
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, auth, body });
    if (url.endsWith('/api/agent/actions')) return Response.json({ actions: ACTIONS });
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    return Response.json(reply(name, body));
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const TOKEN = 'test-agent-service-token-0123456789';

afterEach(() => configureAppActions(null));

describe('Cultured Matter app action tools', () => {
  it('builds one tool per action, with the app description and JSON Schema', () => {
    const tools = buildAppActionTools(ACTIONS, { appUrl: 'http://app', token: TOKEN });
    expect(Object.keys(tools)).toEqual([
      'searchGrants',
      'createTask',
      'deleteProject',
      'draftGrantApplication',
    ]);
    expect(tools.createTask.description).toBe('Create a task.');
  });

  it('runs an action through the app with the service token and returns its data', async () => {
    const app = fakeApp((name, body) => ({ ok: true, data: { name, body } }));
    const tools = buildAppActionTools(ACTIONS, {
      appUrl: 'http://app/',
      token: TOKEN,
      fetch: app.fetch,
    });
    const out = await callTool(tools.createTask, { title: 'Call the lab' });
    expect(out).toEqual({ name: 'createTask', body: { title: 'Call the lab' } });
    expect(app.calls[0]).toMatchObject({
      url: 'http://app/api/agent/actions/createTask',
      auth: `Bearer ${TOKEN}`,
    });
  });

  it("hands the app's error back to the model instead of throwing", async () => {
    const app = fakeApp(() => ({
      ok: false,
      error: { code: 'not_found', message: 'No such task' },
    }));
    const tools = buildAppActionTools(ACTIONS, {
      appUrl: 'http://app',
      token: TOKEN,
      fetch: app.fetch,
    });
    expect(await callTool(tools.createTask, { title: 'x' })).toEqual({
      error: { code: 'not_found', message: 'No such task' },
    });
  });

  it('loads the list from the app, grants reads and categorizes for approvals', async () => {
    const app = fakeApp();
    configureAppActions({ appUrl: 'http://app', token: TOKEN, fetch: app.fetch });
    const tools = await getAppActionTools();
    expect(Object.keys(tools)).toHaveLength(4);
    expect(readActionNames()).toEqual(['searchGrants']);
    expect(resolveToolCategory('searchGrants')).toBe('read');
    expect(resolveToolCategory('createTask')).toBe('edit');
    // A removal asks every time: "Always allow" approves only that one call.
    expect(resolveToolCategory('deleteProject')).toBeNull();
    // A paid redraft (Firecrawl credits and an AI call) asks every time too.
    expect(resolveToolCategory('draftGrantApplication')).toBeNull();
  });

  it('has no app tools when the app is not configured or not reachable', async () => {
    expect(await getAppActionTools()).toEqual({});
    const down = (async () => new Response('', { status: 503 })) as typeof globalThis.fetch;
    configureAppActions({ appUrl: 'http://app', token: TOKEN, fetch: down });
    expect(await getAppActionTools()).toEqual({});
    expect(readActionNames()).toEqual([]);
  });
});

import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUTO_ALLOWED_TOOLS,
  createChatAgentController,
} from '../../src/mastra/lib/agent-controller';
import {
  type AppAction,
  configureAppActions,
  loadAppActions,
  readActionNames,
} from '../../src/mastra/tools/app-actions';

/**
 * The Cultured Matter app actions through the real AgentController, on AIMock.
 * A read action runs with no approval card; a write action stops at the controller's
 * own approval gate and reaches the app only when approved.
 */

const ACTIONS: AppAction[] = [
  {
    name: 'searchGrants',
    description: 'Search grants by board status.',
    kind: 'read',
    inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'createTask',
    description: 'Create a task.',
    kind: 'write',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, dueDate: { type: 'string', format: 'date-time' } },
      required: ['title'],
    },
  },
];

const runs: { name: string; body: unknown }[] = [];

beforeAll(async () => {
  const fetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/agent/actions')) return Response.json({ actions: ACTIONS });
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    const body = JSON.parse(String(init?.body ?? '{}'));
    runs.push({ name, body });
    if (name === 'searchGrants') {
      return Response.json({
        ok: true,
        data: { grants: [{ name: 'Climate Seed Fund', deadline: '2026-10-31' }] },
      });
    }
    return Response.json({ ok: true, data: { id: 'task-1', ...body } });
  }) as typeof globalThis.fetch;
  configureAppActions({ appUrl: 'http://app.test', token: 'x'.repeat(32), fetch });
  await loadAppActions();
});

afterAll(() => configureAppActions(null));

// biome-ignore lint/suspicious/noExplicitAny: AgentControllerEvent union is wide; we assert on .type
async function session(resourceId: string, events: any[]) {
  const controller = createChatAgentController({
    storage: new InMemoryStore(),
    resourceId,
    browser: null,
  });
  await controller.init();
  const s = await controller.createSession({ resourceId });
  // The same grants the live session gets (getChatSession).
  for (const tool of [...AUTO_ALLOWED_TOOLS, ...readActionNames()]) s.grantTool(tool);
  const unsubscribe = s.subscribe((e) => {
    events.push(e);
  });
  await s.thread.create({ title: resourceId });
  return { controller, s, unsubscribe };
}

const gated = (events: { type: string }[]) =>
  events.some((e) => e.type === 'tool_approval_required');

describe('Cultured Matter app actions — AgentController (AIMock)', () => {
  it('runs a read action with no approval card', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: see above
    const events: any[] = [];
    const { controller, s, unsubscribe } = await session('u-cm-read', events);
    runs.length = 0;
    await s.sendMessage({ content: 'Which grants are we watching?' });
    unsubscribe();
    await controller.destroy();

    expect(gated(events)).toBe(false);
    expect(runs).toEqual([{ name: 'searchGrants', body: { status: 'watching' } }]);
    expect(JSON.stringify(events)).toContain('Climate Seed Fund');
  });

  it('stops a write action at the approval gate, then runs it in the app when approved', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: see above
    const events: any[] = [];
    const { controller, s, unsubscribe } = await session('u-cm-approve', events);
    runs.length = 0;
    const done = s.sendMessage({ content: 'Add a task to call the lab on Friday' });
    await waitFor(() => gated(events), 15_000);

    // Parked at the gate: the app has not been called.
    expect(runs).toEqual([]);
    const gate = events.find((e) => e.type === 'tool_approval_required');
    expect(gate.toolName).toBe('createTask');

    s.respondToToolApproval({ decision: 'approve' });
    await done;
    unsubscribe();
    await controller.destroy();

    expect(runs).toEqual([
      { name: 'createTask', body: { title: 'Call the lab', dueDate: '2026-10-09' } },
    ]);
    expect(JSON.stringify(events)).toContain('I added');
  });

  it('never calls the app when the write is declined', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: see above
    const events: any[] = [];
    const { controller, s, unsubscribe } = await session('u-cm-decline', events);
    runs.length = 0;
    const done = s.sendMessage({ content: 'Add a task to call the lab on Friday' });
    await waitFor(() => gated(events), 15_000);

    s.respondToToolApproval({ decision: 'decline' });
    await done;
    unsubscribe();
    await controller.destroy();

    expect(runs).toEqual([]);
    expect(JSON.stringify(events)).toContain("didn't add the task");
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs)
      throw new Error('waitFor: condition not met within timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

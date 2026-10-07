import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FluentMock, startFluentMock } from '../../scripts/fluent-mock';

/**
 * Her WordPress down: every Fluent server answers 503. The chat must still answer, just
 * without the Fluent tools. Its counterpart with the site up is fluent.test.ts.
 */

let wp: FluentMock;

beforeAll(async () => {
  wp = await startFluentMock();
  wp.setDown(true);
  vi.stubEnv('WORDPRESS_URL', wp.url);
  vi.stubEnv('WORDPRESS_MCP_USER', 'cm-agent');
  vi.stubEnv('WORDPRESS_MCP_APP_PASSWORD', 'abcd efgh ijkl mnop qrst uvwx');
});

afterAll(async () => {
  const { disconnectFluent } = await import('../../src/mastra/lib/fluent');
  await disconnectFluent();
  await wp.stop();
  vi.unstubAllEnvs();
});

describe('Fluent tools while WordPress is down', () => {
  it('the chat still answers, offered no Fluent tool', async () => {
    const { createChatAgentController } = await import('../../src/mastra/lib/agent-controller');
    const controller = createChatAgentController({
      storage: new InMemoryStore(),
      resourceId: 'u-fluent-down',
      browser: null,
    });
    await controller.init();
    const session = await controller.createSession({ resourceId: 'u-fluent-down' });
    // biome-ignore lint/suspicious/noExplicitAny: AgentControllerEvent union is wide; we assert on .type
    const events: any[] = [];
    const unsubscribe = session.subscribe((e) => {
      events.push(e);
    });

    const offered: string[][] = [];
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/messages') && typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { tools?: { name: string }[] };
        if (body.tools?.length) offered.push(body.tools.map((t) => t.name));
      }
      return realFetch(input, init);
    });
    try {
      await session.thread.create({ title: 'down' });
      await session.sendMessage({ content: 'Say hello to Simone.' });
    } finally {
      spy.mockRestore();
      unsubscribe();
      await controller.destroy();
    }

    expect(JSON.stringify(events)).toContain('Hello, Simone!');
    expect(events.some((e) => e.type === 'agent_end')).toBe(true);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.flat().filter((name) => /^fluent(-crm|form|-booking)-/.test(name))).toEqual([]);
  });
});

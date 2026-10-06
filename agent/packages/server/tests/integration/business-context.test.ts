import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createChatAgentController } from '../../src/mastra/lib/agent-controller';
import { clearBusinessContextCache } from '../../src/mastra/lib/business-context';
import { configureAppActions } from '../../src/mastra/tools/app-actions';

/**
 * Simone's business context and voice guide on every turn (lib/business-context.ts),
 * through the real AgentController on AIMock. The app is a fake that answers the two read
 * actions the way the real one does (getBusinessProfile's `context` never carries the EIN;
 * the redacted profile beside it is ignored by the agent anyway).
 */

const EIN = '12-3456789';
const app = {
  up: true,
  mission: 'Bring climate innovation to beauty and fashion brands.',
  guide: 'Warm, direct, short sentences. Signs off with "Best, Simone".',
  calls: [] as string[],
};

beforeAll(() => {
  const fetch = (async (url: string) => {
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    app.calls.push(name);
    if (!app.up) throw new TypeError('fetch failed');
    if (name === 'getBusinessProfile') {
      return Response.json({
        ok: true,
        data: {
          // What the real action returns: the EIN value is never in it, only whether it is
          // on file. A stray EIN here would still not reach the model: only `context` is used.
          profile: { name: 'Cultured Matter', ein: EIN, einOnFile: true },
          context: `Cultured Matter: climate innovation for brands.\nMission: ${app.mission}`,
          waitingOn: [],
        },
      });
    }
    if (name === 'getVoiceGuide') {
      return Response.json({
        ok: true,
        data: { guide: app.guide, context: app.guide, updatedAt: null },
      });
    }
    return Response.json({ actions: [] });
  }) as typeof globalThis.fetch;
  configureAppActions({ appUrl: 'http://app.test', token: 'x'.repeat(32), fetch });
});
afterAll(() => configureAppActions(null));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearBusinessContextCache();
  app.up = true;
  app.calls.length = 0;
});

/** Every request body sent to the model (AIMock's /v1/messages). */
function captureProviderRequests() {
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/v1/messages') && typeof init?.body === 'string') sent.push(init.body);
    return realFetch(input, init);
  });
  return sent;
}

/** The chat agent's system prompt among the captured requests (the title call has none of it). */
function chatSystem(sent: string[]): string {
  const systems = sent.map((body) => {
    const { system } = JSON.parse(body) as { system?: string | { text: string }[] };
    return typeof system === 'string' ? system : (system ?? []).map((b) => b.text).join('\n');
  });
  return systems.filter((s) => s.includes('Current date and time')).at(-1) ?? '';
}

async function turn(resourceId: string, content = "What's my mission?") {
  const controller = createChatAgentController({
    storage: new InMemoryStore(),
    resourceId,
    browser: null,
  });
  await controller.init();
  const session = await controller.createSession({ resourceId });
  // biome-ignore lint/suspicious/noExplicitAny: AgentControllerEvent union is wide
  const events: any[] = [];
  const unsubscribe = session.subscribe((e) => {
    events.push(e);
  });
  try {
    await session.thread.create();
    await session.sendMessage({ content });
  } finally {
    unsubscribe();
    await controller.destroy();
  }
  return JSON.stringify(events);
}

describe("Simone's business context and voice (AIMock)", () => {
  it('puts both sections in the request, after the instructions and the date', async () => {
    const sent = captureProviderRequests();
    const events = await turn('u-bc-both');

    expect(events).toContain('I have it in front of me');
    const system = chatSystem(sent);
    const instructions = system.indexOf('Never fabricate tool results');
    const date = system.indexOf('Current date and time');
    const business = system.indexOf("About Simone's business");
    const voice = system.indexOf("Simone's voice guide");
    expect(instructions).toBeGreaterThan(-1);
    expect(date).toBeGreaterThan(instructions);
    expect(business).toBeGreaterThan(date);
    expect(voice).toBeGreaterThan(business);
    expect(system).toContain(app.mission);
    expect(system).toContain(app.guide);
  });

  it('never sends the EIN to the model', async () => {
    const sent = captureProviderRequests();
    await turn('u-bc-ein');
    expect(sent.length).toBeGreaterThan(0);
    for (const body of sent) expect(body).not.toContain(EIN);
  });

  it('shows an edit in Settings once the cache expires, without asking the app every step', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T18:00:00Z'));
    const sent = captureProviderRequests();
    await turn('u-bc-edit-1');
    expect(chatSystem(sent)).toContain(app.mission);
    const callsAfterFirst = app.calls.filter((c) => c === 'getBusinessProfile').length;
    expect(callsAfterFirst).toBe(1);

    // She edits her mission in Settings.
    const before = app.mission;
    app.mission = 'Help brands switch to materials grown, not mined.';

    // Within the minute: still the cached text, and no new call to the app.
    vi.setSystemTime(new Date('2026-10-06T18:00:30Z'));
    sent.length = 0;
    await turn('u-bc-edit-2');
    expect(chatSystem(sent)).toContain(before);
    expect(app.calls.filter((c) => c === 'getBusinessProfile').length).toBe(1);

    // After it: the new mission.
    vi.setSystemTime(new Date('2026-10-06T18:01:05Z'));
    sent.length = 0;
    await turn('u-bc-edit-3');
    expect(chatSystem(sent)).toContain(app.mission);
    expect(chatSystem(sent)).not.toContain(before);
  });

  it('still answers when the app is down, with no business or voice section', async () => {
    app.up = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent = captureProviderRequests();
    const events = await turn('u-bc-down');

    expect(events).toContain("I can't see your business profile right now.");
    const system = chatSystem(sent);
    expect(system).toContain('Current date and time');
    expect(system).not.toContain("About Simone's business");
    expect(system).not.toContain("Simone's voice guide");
  });
});

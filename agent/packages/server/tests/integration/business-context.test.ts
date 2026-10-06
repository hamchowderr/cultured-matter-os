import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AUTO_ALLOWED_TOOLS,
  createChatAgentController,
} from '../../src/mastra/lib/agent-controller';
import { clearBusinessContextCache } from '../../src/mastra/lib/business-context';
import {
  type AppAction,
  configureAppActions,
  loadAppActions,
  readActionNames,
} from '../../src/mastra/tools/app-actions';

/**
 * Simone's business context and voice guide on every turn (lib/business-context.ts),
 * through the real AgentController on AIMock. The app is a fake that answers the two read
 * actions the way the real one does (getBusinessProfile's `context` never carries the EIN;
 * the redacted profile beside it is ignored by the agent anyway), and offers the one write
 * that changes them, updateBusinessProfile.
 */

const EIN = '12-3456789';
const FIRST_MISSION = 'Bring climate innovation to beauty and fashion brands.';
const app = {
  up: true,
  mission: FIRST_MISSION,
  guide: 'Warm, direct, short sentences. Signs off with "Best, Simone".',
  calls: [] as string[],
};

const ACTIONS: AppAction[] = [
  {
    name: 'updateBusinessProfile',
    description: 'Change fields of the business profile.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { mission: { type: 'string' } } },
  },
];

beforeAll(async () => {
  const fetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/agent/actions')) return Response.json({ actions: ACTIONS });
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
    if (name === 'updateBusinessProfile') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { mission?: string };
      if (body.mission) app.mission = body.mission;
      return Response.json({ ok: true, data: { changed: ['mission'] } });
    }
    return Response.json({ ok: false, error: { code: 'not_found', message: 'No such action' } });
  }) as typeof globalThis.fetch;
  configureAppActions({ appUrl: 'http://app.test', token: 'x'.repeat(32), fetch });
  await loadAppActions();
});
afterAll(() => configureAppActions(null));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearBusinessContextCache();
  app.up = true;
  app.mission = FIRST_MISSION;
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

/** The chat agent's system prompts among the captured requests (the title call has none). */
function chatSystems(sent: string[]): string[] {
  return sent
    .map((body) => {
      const { system } = JSON.parse(body) as { system?: string | { text: string }[] };
      return typeof system === 'string' ? system : (system ?? []).map((b) => b.text).join('\n');
    })
    .filter((s) => s.includes('Current date and time'));
}
const chatSystem = (sent: string[]) => chatSystems(sent).at(-1) ?? '';
const profileCalls = () => app.calls.filter((c) => c === 'getBusinessProfile').length;

/** One turn on a real session; write approvals are approved, as Simone would. */
async function turn(resourceId: string, content = "What's my mission?") {
  const controller = createChatAgentController({
    storage: new InMemoryStore(),
    resourceId,
    browser: null,
  });
  await controller.init();
  const session = await controller.createSession({ resourceId });
  for (const tool of [...AUTO_ALLOWED_TOOLS, ...readActionNames()]) session.grantTool(tool);
  // biome-ignore lint/suspicious/noExplicitAny: AgentControllerEvent union is wide
  const events: any[] = [];
  const unsubscribe = session.subscribe((e) => {
    events.push(e);
    if (e.type === 'tool_approval_required') session.respondToToolApproval({ decision: 'approve' });
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
  it('puts both sections in the request: after the instructions, before the date', async () => {
    const sent = captureProviderRequests();
    const events = await turn('u-bc-both');

    expect(events).toContain('I have it in front of me');
    const system = chatSystem(sent);
    const instructions = system.indexOf('Never fabricate tool results');
    const business = system.indexOf("About Simone's business");
    const voice = system.indexOf("Simone's voice guide");
    const date = system.indexOf('Current date and time');
    expect(instructions).toBeGreaterThan(-1);
    // Stable text first, the per-minute date last.
    expect(business).toBeGreaterThan(instructions);
    expect(voice).toBeGreaterThan(business);
    expect(date).toBeGreaterThan(voice);
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
    expect(chatSystem(sent)).toContain(FIRST_MISSION);
    expect(profileCalls()).toBe(1);

    // She edits her mission in Settings.
    app.mission = 'Help brands switch to materials grown, not mined.';

    // Within the minute: still the cached text, and no new call to the app.
    vi.setSystemTime(new Date('2026-10-06T18:00:30Z'));
    sent.length = 0;
    await turn('u-bc-edit-2');
    expect(chatSystem(sent)).toContain(FIRST_MISSION);
    expect(profileCalls()).toBe(1);

    // After it: the new mission.
    vi.setSystemTime(new Date('2026-10-06T18:01:05Z'));
    sent.length = 0;
    await turn('u-bc-edit-3');
    expect(chatSystem(sent)).toContain(app.mission);
    expect(chatSystem(sent)).not.toContain(FIRST_MISSION);
  });

  it("the assistant's own approved write shows on the very next step", async () => {
    const sent = captureProviderRequests();
    const events = await turn('u-bc-write', 'Update my mission: grown, not mined.');

    expect(events).toContain('Done, your mission is updated.');
    const systems = chatSystems(sent);
    // The step that called the tool saw the old mission; the step after the approved write
    // (well within the cache's minute) sees the new one.
    expect(systems[0]).toContain(FIRST_MISSION);
    expect(systems.at(-1)).toContain('Help brands switch to materials grown, not mined.');
    expect(systems.at(-1)).not.toContain(FIRST_MISSION);
  });

  it('keeps the last good text when a refresh fails, and waits before asking again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T18:00:00Z'));
    const sent = captureProviderRequests();
    await turn('u-bc-swr-1');
    expect(profileCalls()).toBe(1);

    // The cache has expired and the app is down: the last good text, not nothing.
    app.up = false;
    vi.setSystemTime(new Date('2026-10-06T18:01:05Z'));
    sent.length = 0;
    await turn('u-bc-swr-2');
    expect(chatSystem(sent)).toContain(FIRST_MISSION);
    expect(profileCalls()).toBe(2);

    // Within 15 s of that failure the app is not asked again (no timeout on every step).
    vi.setSystemTime(new Date('2026-10-06T18:01:15Z'));
    await turn('u-bc-swr-3');
    expect(profileCalls()).toBe(2);

    // After it, it is: and once the app is back, fresh text.
    app.up = true;
    app.mission = 'Help brands switch to materials grown, not mined.';
    vi.setSystemTime(new Date('2026-10-06T18:01:25Z'));
    sent.length = 0;
    await turn('u-bc-swr-4');
    expect(profileCalls()).toBe(3);
    expect(chatSystem(sent)).toContain(app.mission);
  });

  it('still answers when the app is down from the start, with no business or voice section', async () => {
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

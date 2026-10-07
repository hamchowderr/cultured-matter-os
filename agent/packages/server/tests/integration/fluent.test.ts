import type { AgentController, Session } from '@mastra/core/agent-controller';
import { InMemoryStore } from '@mastra/core/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FluentMock, startFluentMock } from '../../scripts/fluent-mock';

/**
 * Simone's FluentCRM, Fluent Forms and Fluent Booking tools end to end: the real
 * AgentController and chat agent on AIMock, with her three WordPress MCP servers mocked by
 * AIMock's MCPMock (scripts/fluent-mock.ts) from the tool lists the real servers return.
 */

let wp: FluentMock;
let controller: AgentController;
let grants: readonly string[] = [];
let disconnectFluent: () => Promise<void>;

beforeAll(async () => {
  wp = await startFluentMock();
  vi.stubEnv('WORDPRESS_URL', wp.url);
  vi.stubEnv('WORDPRESS_MCP_USER', 'cm-agent');
  vi.stubEnv('WORDPRESS_MCP_APP_PASSWORD', 'abcd efgh ijkl mnop qrst uvwx');
  // Dynamic imports: env.ts reads process.env once, when it first loads.
  const ac = await import('../../src/mastra/lib/agent-controller');
  const fluent = await import('../../src/mastra/lib/fluent');
  disconnectFluent = fluent.disconnectFluent;
  // The same grants the live session gets (getChatSession).
  grants = [...ac.AUTO_ALLOWED_TOOLS, ...fluent.FLUENT_READ_TOOLS];
  controller = ac.createChatAgentController({
    storage: new InMemoryStore(),
    resourceId: 'u-fluent',
    browser: null,
  });
  await controller.init();
}, 60_000);

afterAll(async () => {
  await controller?.destroy();
  await disconnectFluent?.();
  await wp?.stop();
  vi.unstubAllEnvs();
});

/** The tool names each model request offered (AIMock's journal only keeps the text). */
function spyOnOfferedTools() {
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
  return { offered, restore: () => spy.mockRestore() };
}

/** A session with the grants the live one gets. */
async function newSession(resourceId = 'u-fluent'): Promise<Session> {
  const session = await controller.createSession({ resourceId });
  for (const tool of grants) session.grantTool(tool);
  return session;
}

/**
 * Send one message on a fresh thread (of `existing`, or a new session). Answers any
 * approval card with `decision`.
 */
async function turn(
  content: string,
  decision: 'approve' | 'decline' | 'always_allow_category' = 'approve',
  existing?: Session,
) {
  const session = existing ?? (await newSession());
  // biome-ignore lint/suspicious/noExplicitAny: AgentControllerEvent union is wide; we assert on .type
  const events: any[] = [];
  const approvals: string[] = [];
  const callsAtGate: number[] = [];
  const unsubscribe = session.subscribe((e) => {
    events.push(e);
    if (e.type === 'tool_approval_required') {
      approvals.push(e.toolName);
      callsAtGate.push(wp.calls.length);
      session.respondToToolApproval({ decision });
    }
  });
  await session.thread.create({ title: content });
  await session.sendMessage({ content });
  unsubscribe();
  return { events, approvals, callsAtGate, blob: JSON.stringify(events) };
}

describe('Fluent tools — AgentController (AIMock + mocked WordPress MCP)', () => {
  it('a read runs with no approval card, and the excluded tools are never offered', async () => {
    const { offered, restore } = spyOnOfferedTools();
    const before = wp.calls.length;
    const { approvals, blob } = await turn('Who is in my CRM?').finally(restore);

    expect(approvals).toEqual([]);
    expect(wp.calls.slice(before)).toEqual([
      { name: 'fluent-crm-list-contacts', args: { per_page: 20 } },
    ]);
    expect(blob).toContain('Your CRM has one contact: Ada Lovelace');

    expect(offered[0]).toEqual(
      expect.arrayContaining([
        'fluent-crm-list-contacts',
        'fluent-crm-upsert-contact',
        'fluentform-list-forms',
        'fluent-booking-create-booking',
      ]),
    );
    for (const absent of [
      'fluent-crm-send-email-to-contact',
      'fluent-crm-send-test-email',
      'fluent-crm-delete-contact',
      'fluent-crm-delete-contact-note',
      'fluent-crm-change-campaign-status',
      'fluent-crm-update-contact-automation-status',
      'fluent-crm-apply-segments-to-contacts',
      'fluent-crm-bulk-upsert-contacts',
      'fluentform-delete-submission',
      'fluentform-bulk-update-submissions',
    ]) {
      expect(offered.flat()).not.toContain(absent);
    }
  });

  it('a write stops at the approval card and reaches WordPress only when approved', async () => {
    const before = wp.calls.length;
    const { approvals, callsAtGate, blob } = await turn('Add Grace Hopper to my CRM');

    expect(approvals).toEqual(['fluent-crm-upsert-contact']);
    // Parked at the gate, WordPress had not been called.
    expect(callsAtGate).toEqual([before]);
    expect(wp.calls.slice(before)).toEqual([
      {
        name: 'fluent-crm-upsert-contact',
        args: { email: 'grace@hopper.example', first_name: 'Grace', last_name: 'Hopper' },
      },
    ]);
    expect(blob).toContain('I added Grace Hopper to your CRM.');
  });

  it('"Always allow edit" never covers an outward-facing write (a campaign draft)', async () => {
    // Its own user: an "Always allow" lasts for the user's session, not just this thread.
    const session = await newSession('u-fluent-always');
    // Always allow edits, from upsert-contact's card.
    const first = await turn('Add Grace Hopper to my CRM', 'always_allow_category', session);
    expect(first.approvals).toEqual(['fluent-crm-upsert-contact']);
    // The grant took: the same edit now runs with no card.
    const again = await turn('Add Grace Hopper to my CRM', 'approve', session);
    expect(again.approvals).toEqual([]);
    // A campaign draft still asks.
    const before = wp.calls.length;
    const campaign = await turn(
      'Draft a campaign announcing the Climate Seed Fund',
      'decline',
      session,
    );
    expect(campaign.approvals).toEqual(['fluent-crm-upsert-campaign']);
    expect(wp.calls.length).toBe(before);
  });

  it('a declined write never reaches WordPress', async () => {
    const before = wp.calls.length;
    const { approvals, blob } = await turn('Add Grace Hopper to my CRM', 'decline');

    expect(approvals).toEqual(['fluent-crm-upsert-contact']);
    expect(wp.calls.length).toBe(before);
    expect(blob).toContain("I didn't add Grace");
  });

  it('a guarded write asks once, then runs the dry run and the confirmed call', async () => {
    const before = wp.calls.length;
    const { approvals, blob } = await turn('Book Ada for a call on 20 October at 10am');

    expect(approvals).toEqual(['fluent-booking-create-booking']);
    const calls = wp.calls.slice(before);
    expect(calls.map((c) => c.name)).toEqual([
      'fluent-booking-create-booking',
      'fluent-booking-create-booking',
    ]);
    expect(calls[0].args.dry_run).toBe(true);
    expect(calls[1].args.confirm_token).toEqual(expect.any(String));
    expect(blob).toContain('Booked: Ada Lovelace on 20 October at 10:00.');
  });
});

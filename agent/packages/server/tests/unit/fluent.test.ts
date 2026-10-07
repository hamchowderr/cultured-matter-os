import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FluentMock, fluentToolLists, startFluentMock } from '../../scripts/fluent-mock';
import {
  createFluentClient,
  FLUENT_READ_TOOLS,
  FLUENT_WRITE_TOOLS,
  fluentToolCategory,
  getFluentTools,
  loadFluentTools,
} from '../../src/mastra/lib/fluent';
import {
  FORKED_RUN_TOOLS,
  PLAN_MODE_TOOLS,
  resolveToolCategory,
} from '../../src/mastra/lib/tool-categories';

/**
 * lib/fluent.ts at the MCP boundary: the real MCPClient against AIMock's MCP mocks of
 * Simone's FluentCRM, Fluent Forms and Fluent Booking servers, which list the tools the real
 * servers list (fixtures/fluent-mcp-tools.json). No model, no WordPress.
 */

let wp: FluentMock;
beforeAll(async () => {
  wp = await startFluentMock();
});
afterAll(async () => {
  await wp.stop();
});

let clients = 0;
/** A client for the mock; each gets its own id (MCPClient refuses duplicate configs). */
function client(url = wp.url, appPassword = 'abcd efgh ijkl mnop qrst uvwx') {
  clients += 1;
  return createFluentClient({ url, user: 'cm-agent', appPassword }, `fluent-unit-${clients}`);
}

// biome-ignore lint/suspicious/noExplicitAny: MCP tool schemas and results are untyped
async function offered(): Promise<Record<string, any>> {
  const mcp = client();
  const tools = await loadFluentTools(mcp);
  return { ...tools, disconnect: () => mcp.disconnect() };
}

/** Tools the servers list that the agent must never get. */
const EXCLUDED = [
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
  'fluentform-create-form',
];

describe('Fluent tools from the three MCP servers', () => {
  it('offers exactly the read and write lists, and none of the excluded tools', async () => {
    // The fixture really holds the excluded tools: they are there to be dropped.
    const listed = Object.values(fluentToolLists()).flatMap((tools) => tools.map((t) => t.name));
    expect(listed).toEqual(expect.arrayContaining(EXCLUDED));

    const tools = await offered();
    await tools.disconnect();
    const names = Object.keys(tools).filter((name) => name !== 'disconnect');
    expect(names.sort()).toEqual([...FLUENT_READ_TOOLS, ...FLUENT_WRITE_TOOLS].sort());
    for (const name of EXCLUDED) expect(names).not.toContain(name);
  });

  it('signs in with the application password as HTTP Basic', async () => {
    const mcp = client(wp.url, 'basic-check-password');
    await loadFluentTools(mcp);
    await mcp.disconnect();
    const expected = `Basic ${Buffer.from('cm-agent:basic-check-password').toString('base64')}`;
    expect(wp.authorizations()).toContain(expected);
  });

  it('a read returns what the server returned', async () => {
    const tools = await offered();
    const result = await tools['fluent-crm-list-contacts'].execute({ per_page: 20 }, {});
    await tools.disconnect();
    expect(JSON.stringify(result)).toContain('Ada');
  });

  it('tags and lists can be created and updated, never deleted or merged', async () => {
    const tools = await offered();
    const before = wp.calls.length;
    for (const name of ['fluent-crm-manage-tag', 'fluent-crm-manage-list']) {
      expect(tools[name].inputSchema).toBeDefined();
      for (const input of [
        { action: 'delete', tag_id: 1, list_id: 1 },
        { action: 'merge', to_tag_id: 2, to_list_id: 2 },
        { action: 'create', title: 'x', force: true },
      ]) {
        const result = await tools[name].execute(input, {});
        expect(result?.error, `${name} ${JSON.stringify(input)}`).toBe(true);
      }
    }
    expect(wp.calls.length).toBe(before);

    await tools['fluent-crm-manage-tag'].execute({ action: 'create', title: 'Investors' }, {});
    await tools.disconnect();
    expect(wp.calls.slice(before)).toEqual([
      { name: 'fluent-crm-manage-tag', args: { action: 'create', title: 'Investors' } },
    ]);
  });

  it('removed inputs (double opt-in email, refunds, resent emails, dropped fields) never reach WordPress', async () => {
    const tools = await offered();
    const before = wp.calls.length;
    const refused: [string, Record<string, unknown>][] = [
      ['fluent-crm-upsert-contact', { email: 'a@b.example', double_optin: true }],
      ['fluent-booking-manage-booking', { booking_id: 1, action: 'resend_email' }],
      ['fluent-booking-manage-booking', { booking_id: 1, action: 'cancel', refund_payment: true }],
      ['fluentform-update-form-fields', { form_id: 1, fields: [], allow_field_removal: true }],
      // The guard's own inputs are the tool's to send, not the model's.
      [
        'fluent-booking-create-booking',
        { event_id: 1, start_time: 'x', name: 'n', email: 'e', confirm_token: 't' },
      ],
    ];
    for (const [name, input] of refused) {
      const result = await tools[name].execute(input, {});
      expect(result?.error, `${name} ${JSON.stringify(input)}`).toBe(true);
    }
    await tools.disconnect();
    expect(wp.calls.length).toBe(before);
  });

  it('a guarded write runs the dry run, then the same call with its confirm_token', async () => {
    const tools = await offered();
    const before = wp.calls.length;
    const input = {
      event_id: 1,
      start_time: '2026-10-20 10:00:00',
      name: 'Ada Lovelace',
      email: 'ada@lovelace.example',
    };
    const result = await tools['fluent-booking-create-booking'].execute(input, {});
    await tools.disconnect();
    expect(JSON.parse(result.content[0].text).data.booking_id).toBe(31);
    const [preview, confirmed] = wp.calls.slice(before);
    expect(preview).toEqual({
      name: 'fluent-booking-create-booking',
      args: { ...input, dry_run: true },
    });
    expect(confirmed.name).toBe('fluent-booking-create-booking');
    expect(confirmed.args).toEqual({
      ...input,
      confirm_token: 'token-1',
      idempotency_key: expect.any(String),
    });
    expect(wp.calls.length).toBe(before + 2);
  });

  it('a guarded tool tells the agent the approval card is the confirmation', async () => {
    const tools = await offered();
    await tools.disconnect();
    for (const name of ['fluent-booking-create-booking', 'fluentform-update-form-styling']) {
      const schema = JSON.stringify(tools[name].inputSchema);
      for (const key of ['dry_run', 'confirm_token', 'idempotency_key']) {
        expect(schema).not.toContain(`"${key}"`);
      }
      expect(tools[name].description).toContain('the approval card is the confirmation');
    }
  });

  it('an unreachable site means no tools, not a failed run', async () => {
    const mcp = client('http://127.0.0.1:9');
    const tools = await loadFluentTools(mcp);
    await mcp.disconnect();
    expect(tools).toEqual({});
  });

  it('with no WordPress settings there are no Fluent tools', async () => {
    expect(await getFluentTools()).toEqual({});
  });
});

describe('Fluent approvals, Plan mode and forked runs', () => {
  it('reads are `read`, plain writes `edit`, and the outward-facing writes ask every time', () => {
    for (const name of FLUENT_READ_TOOLS) expect(resolveToolCategory(name)).toBe('read');
    for (const name of [
      'fluent-crm-upsert-contact',
      'fluent-crm-add-contact-note',
      'fluent-crm-manage-tag',
      'fluent-crm-manage-list',
    ]) {
      expect(resolveToolCategory(name)).toBe('edit');
    }
    // `null`: an "Always allow edit" never covers them.
    for (const name of [
      'fluent-booking-create-booking',
      'fluent-booking-manage-booking',
      'fluent-crm-upsert-campaign',
      'fluentform-upsert-email-notification',
      'fluentform-update-form-fields',
      'fluentform-update-form-styling',
    ]) {
      expect(resolveToolCategory(name)).toBeNull();
    }
    // Every write is one or the other.
    for (const name of FLUENT_WRITE_TOOLS) expect(resolveToolCategory(name)).not.toBe('read');
    expect(fluentToolCategory('fluent-crm-delete-contact')).toBeUndefined();
  });

  it('Plan mode and forked subagent runs get the reads and no write', () => {
    for (const list of [PLAN_MODE_TOOLS, FORKED_RUN_TOOLS]) {
      for (const name of FLUENT_READ_TOOLS) expect(list).toContain(name);
      for (const name of FLUENT_WRITE_TOOLS) expect(list).not.toContain(name);
    }
  });
});

describe('a down site is not asked again on every run', () => {
  it('after a failed discovery, runs skip WordPress for the backoff, then retry', async () => {
    let hits = 0;
    const down = createServer((_req, res) => {
      hits += 1;
      res.writeHead(503);
      res.end();
    });
    await new Promise<void>((resolve) => down.listen(0, '127.0.0.1', resolve));
    const { port } = down.address() as AddressInfo;

    vi.stubEnv('WORDPRESS_URL', `http://127.0.0.1:${port}`);
    vi.stubEnv('WORDPRESS_MCP_USER', 'cm-agent');
    vi.stubEnv('WORDPRESS_MCP_APP_PASSWORD', 'abcd efgh ijkl mnop qrst uvwx');
    vi.resetModules();
    const live = await import('../../src/mastra/lib/fluent');
    let clock = 1_000_000;
    const now = () => clock;
    try {
      expect(await live.getFluentTools(now)).toEqual({});
      const afterFirst = hits;
      expect(afterFirst).toBeGreaterThan(0);

      // Within the backoff: no request at all.
      clock += live.DISCOVERY_BACKOFF_MS - 1;
      expect(await live.getFluentTools(now)).toEqual({});
      expect(hits).toBe(afterFirst);

      // Past it: discovery runs again.
      clock += 2;
      await live.getFluentTools(now);
      expect(hits).toBeGreaterThan(afterFirst);
    } finally {
      await live.disconnectFluent();
      vi.unstubAllEnvs();
      vi.resetModules();
      await new Promise<void>((resolve) => {
        down.close(() => resolve());
        down.closeAllConnections();
      });
    }
  });
});

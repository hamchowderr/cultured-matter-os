/**
 * Simone's three Fluent MCP servers (FluentCRM, Fluent Forms, Fluent Booking), mocked with
 * AIMock's MCPMock, for the tests and for a local run that never touches her WordPress.
 *
 * Each advertises the tool list the real server returns (fixtures/fluent-mcp-tools.json,
 * from scripts/capture-fluent-tools.ts) at the same path under /wp-json, and answers the
 * tools the tests call with plugin-shaped JSON. The guarded writes behave like the plugins'
 * WriteGuard: a `dry_run` call returns a `confirm_token`, and only a call carrying it acts.
 *
 * Run it on its own (it prints the URL to put in WORDPRESS_URL):
 *   pnpm --filter @mastra-chat-kit/server exec tsx scripts/fluent-mock.ts [port]
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCPMock } from '@copilotkit/aimock';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/fluent-mcp-tools.json',
);

type ToolDef = { name: string; description?: string; inputSchema?: Record<string, unknown> };

/** Route under /wp-json → server key, as lib/fluent.ts's FLUENT_SERVERS. */
const ROUTES = {
  'fluent-crm/mcp': 'crm',
  'fluentform/mcp': 'forms',
  'fluent-booking/mcp': 'booking',
} as const;

/** The tools each real server lists, by server key (without output schemas). */
export function fluentToolLists(): Record<string, ToolDef[]> {
  const { servers } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    servers: Record<string, (ToolDef & { outputSchema?: unknown })[]>;
  };
  return Object.fromEntries(
    Object.entries(servers).map(([server, tools]) => [
      server,
      tools.map(({ outputSchema: _dropped, ...def }) => def),
    ]),
  );
}

/** The one contact the mocked CRM holds. */
export const MOCK_CONTACT = {
  id: 7,
  email: 'ada@lovelace.example',
  first_name: 'Ada',
  last_name: 'Lovelace',
  status: 'subscribed',
};

/** A plugin's success envelope (MCPHelper::success). */
const ok = (data: unknown) =>
  JSON.stringify({ data, meta: { generated_at: '2026-10-07 12:00:00' } });

export type FluentMock = {
  /** The WordPress site: what WORDPRESS_URL points at. */
  url: string;
  /** The Authorization header of every request the mocks received. */
  authorizations(): string[];
  /** Every tool call that reached a mock, in order. */
  calls: { name: string; args: Record<string, unknown> }[];
  /** Answer 503 to everything, as a site that is down does. */
  setDown(down: boolean): void;
  stop(): Promise<void>;
};

/**
 * Start the three mocks on one server on `port` (0 = any free port), each at its real path.
 * The server notes each request's Authorization header and answers 405 to the GET a
 * Streamable HTTP client opens for server notifications, which the MCP spec allows a server
 * that sends none.
 */
export async function startFluentMock(port = 0): Promise<FluentMock> {
  const calls: FluentMock['calls'] = [];
  const tokens = new Set<string>();
  const lists = fluentToolLists();
  const mocks = new Map<string, MCPMock>();
  for (const [route, server] of Object.entries(ROUTES)) {
    const mock = new MCPMock({ serverInfo: { name: `${server}-mock`, version: '1.0.0' } });
    for (const def of lists[server] ?? []) {
      mock.addTool(def);
      mock.onToolCall(def.name, (raw) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        calls.push({ name: def.name, args });
        return answer(def.name, args, tokens);
      });
    }
    mocks.set(`/wp-json/${route}`, mock);
  }
  const seen: string[] = [];
  let down = false;
  const server = createServer((req, res) => {
    seen.push(req.headers.authorization ?? '');
    const mock = mocks.get((req.url ?? '').split('?')[0]);
    if (down || !mock) {
      res.writeHead(down ? 503 : 404);
      res.end();
      return;
    }
    mock
      .handleRequest(req, res, '/')
      .then((handled) => {
        if (!handled) {
          res.writeHead(405);
          res.end();
        }
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: bound } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${bound}`,
    authorizations: () => [...seen],
    calls,
    setDown: (value) => {
      down = value;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** What a mocked tool returns. Errors are thrown, which MCPMock sends as an error result. */
function answer(name: string, args: Record<string, unknown>, tokens: Set<string>): string {
  // The guarded writes (Fluent Forms, Fluent Booking): preview first, then act on the token.
  if ('confirm_token' in args || args.dry_run === true) {
    if (args.dry_run === true) {
      const token = `token-${tokens.size + 1}`;
      tokens.add(token);
      return ok({ dry_run: true, preview: { tool: name, args }, confirm_token: token });
    }
    if (!tokens.delete(String(args.confirm_token))) {
      throw new Error('The confirm_token does not match. Run a fresh dry_run.');
    }
  }
  switch (name) {
    case 'fluent-crm-list-contacts':
      return ok({ contacts: [MOCK_CONTACT], total: 1 });
    case 'fluent-crm-upsert-contact':
      return ok({ action: 'created', contact: { id: 8, ...args } });
    case 'fluent-booking-create-booking':
      return ok({ booking_id: 31, status: 'scheduled', start_time: args.start_time });
    default:
      return ok({});
  }
}

// `tsx scripts/fluent-mock.ts [port]` runs it standalone.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startFluentMock(Number(process.argv[2] ?? 4021));
  console.log(`Fluent MCP mock (WORDPRESS_URL): ${url}`);
}

import { randomUUID } from 'node:crypto';
import type { ToolsInput } from '@mastra/core/agent';
import type { ToolCategory } from '@mastra/core/agent-controller';
import { createTool } from '@mastra/core/tools';
import { MCPClient } from '@mastra/mcp';
import { env } from '../../lib/env';

/**
 * # Simone's FluentCRM, Fluent Forms and Fluent Booking (Cultured Matter)
 *
 * Her WordPress site runs the Fluent plugins, and each one ships its own MCP server through
 * the WordPress MCP Adapter bundled in Fluent Toolkit:
 *
 * - FluentCRM at `/wp-json/fluent-crm/mcp` (contacts, notes, tags, lists, campaigns);
 * - Fluent Forms at `/wp-json/fluentform/mcp` (forms, entries, styling, notifications);
 * - Fluent Booking at `/wp-json/fluent-booking/mcp` (bookings, slots, event types).
 *
 * All three speak Streamable HTTP and sign in with a WordPress application password
 * (HTTP Basic). The password belongs to a WordPress user made for the agent (`cm-agent`, a
 * subscriber) that holds only the Fluent permissions these tools need, so WordPress itself
 * refuses anything outside them (deleting contacts or entries, sending email from FluentCRM
 * settings, other people's admin screens). Fluent Forms and Fluent Booking ship their MCP
 * switched off; it is switched on in each plugin's settings (or Fluent Toolkit's MCP page).
 *
 * Setting WORDPRESS_URL, WORDPRESS_MCP_USER and WORDPRESS_MCP_APP_PASSWORD turns this on.
 * The chat agent carries the tools (its `tools`, next to the app actions; agents/chat.ts), so
 * a WordPress outage only costs the chat these tools for a while (DISCOVERY_BACKOFF_MS).
 *
 * The servers list about 55 tools. Only the ones named below are offered, by name, so a
 * plugin update that adds a tool adds nothing here until it is put on a list on purpose:
 *
 * - FLUENT_READ_TOOLS look things up and run with no approval card, in Plan mode too.
 * - FLUENT_WRITE_TOOLS change her data and stop at the approval card every time.
 * - Everything else is left out: tools that send email (send-email-to-contact,
 *   send-test-email), delete (delete-contact, delete-contact-note, delete-submission),
 *   act on many records at once (bulk-upsert-contacts, apply-segments-to-contacts,
 *   bulk-update-submissions), send or schedule a campaign (change-campaign-status), move
 *   people through automations, and ones she did not ask for (create-form, entry status
 *   and notes, payments).
 *
 * Some offered writes can still do too much through one input, so their schemas are
 * narrowed before the agent sees them (restrictDefinition): no deleting or merging tags and
 * lists, no double opt-in email from upsert-contact, no resending booking emails or
 * refunds, no dropping form fields (which orphans their stored answers).
 */

/** The MCPClient server key → the server's route under /wp-json. */
export const FLUENT_SERVERS = {
  crm: 'fluent-crm/mcp',
  forms: 'fluentform/mcp',
  booking: 'fluent-booking/mcp',
} as const;

type Server = keyof typeof FLUENT_SERVERS;

/**
 * Tools that only read, under the names the servers list them by (the MCP Adapter turns an
 * ability's `fluent-crm/list-contacts` into `fluent-crm-list-contacts`).
 */
export const FLUENT_READ_TOOLS = [
  'fluent-crm-get-crm-context',
  'fluent-crm-list-contacts',
  'fluent-crm-get-contact-filter-schema',
  'fluent-crm-get-contact',
  'fluent-crm-list-tags',
  'fluent-crm-list-lists',
  'fluent-crm-list-campaigns',
  'fluent-crm-get-campaign',
  'fluent-crm-list-automations',
  'fluent-crm-list-funnel-subscribers',
  'fluent-crm-get-automation',
  // Renders an email as HTML; sends nothing (send-test-email is the one that sends).
  'fluent-crm-render-email-preview',
  'fluentform-get-forms-context',
  'fluentform-list-forms',
  'fluentform-get-form',
  'fluentform-list-submissions',
  'fluentform-get-submission',
  'fluentform-get-form-stats',
  'fluentform-get-submissions-trend',
  'fluentform-get-submissions-report',
  'fluentform-list-integrations',
  'fluentform-get-form-styling',
  'fluentform-list-email-notifications',
  'fluent-booking-get-booking-context',
  'fluent-booking-list-bookings',
  'fluent-booking-get-booking',
  'fluent-booking-get-available-slots',
  'fluent-booking-diagnose-availability',
  'fluent-booking-get-event-types',
  'fluent-booking-query-bookings',
] as const;

/** Tools that change her data. Each one stops at the approval card. */
export const FLUENT_WRITE_TOOLS = [
  'fluent-crm-upsert-contact',
  'fluent-crm-add-contact-note',
  'fluent-crm-manage-tag',
  'fluent-crm-manage-list',
  // Creates or edits a DRAFT campaign; sending or scheduling one is change-campaign-status,
  // which is not offered.
  'fluent-crm-upsert-campaign',
  'fluentform-update-form-fields',
  'fluentform-update-form-styling',
  'fluentform-upsert-email-notification',
  'fluent-booking-create-booking',
  'fluent-booking-manage-booking',
] as const;

/**
 * Writes that email or text people outside (the attendee and host of a booking). Their
 * category is `null`, so an "Always allow" on one approves just that call and each booking
 * change still asks.
 */
const ALWAYS_ASK = new Set<string>([
  'fluent-booking-create-booking',
  'fluent-booking-manage-booking',
]);

/**
 * Writes guarded by the plugin's own dry run: the server previews the change and issues a
 * `confirm_token`, and only a second call carrying that token changes anything. The guard is
 * there so text from the public (a form entry, a booking note) cannot complete a write on
 * its own; here the approval card is that second pass. So the agent is not shown the guard's
 * inputs: once Simone approves, the tool runs the dry run and then the confirmed call itself,
 * with the same arguments (fluentWriteTool).
 */
const GUARD_INPUTS = ['dry_run', 'confirm_token', 'idempotency_key'] as const;

/**
 * Inputs removed from an offered tool's schema, and the values an `enum` input may still
 * take. Each removal stops a write doing more than the card says.
 */
const RESTRICTIONS: Record<string, { remove?: string[]; enums?: Record<string, string[]> }> = {
  // double_optin emails the contact an opt-in request.
  'fluent-crm-upsert-contact': { remove: ['double_optin'] },
  // delete and merge remove tags/lists and move their contacts; only create and update stay.
  'fluent-crm-manage-tag': {
    remove: ['force', 'from_tag_ids', 'to_tag_id', 'dry_run'],
    enums: { action: ['create', 'update'] },
  },
  'fluent-crm-manage-list': {
    remove: ['force', 'from_list_ids', 'to_list_id', 'dry_run'],
    enums: { action: ['create', 'update'] },
  },
  // Dropping a field orphans every stored answer to it.
  'fluentform-update-form-fields': { remove: ['allow_field_removal'] },
  // resend_email only sends email; a refund moves money.
  'fluent-booking-manage-booking': {
    remove: ['recipient', 'refund_payment'],
    enums: {
      action: [
        'reschedule',
        'cancel',
        'confirm',
        'reject',
        'complete',
        'no_show',
        'update_details',
      ],
    },
  },
};

/** Which server lists a tool, from its name. */
export function serverOf(name: string): Server {
  if (name.startsWith('fluent-crm-')) return 'crm';
  if (name.startsWith('fluentform-')) return 'forms';
  return 'booking';
}

/** How long tool discovery may take before a run goes ahead without these tools. */
const DISCOVERY_TIMEOUT_MS = 10_000;

/** After a failed discovery, runs skip WordPress this long instead of waiting again. */
export const DISCOVERY_BACKOFF_MS = 60_000;

export type FluentConfig = {
  /** The WordPress site, e.g. https://culturedmatter.otakusolutions.io */
  url: string;
  user: string;
  appPassword: string;
};

/** An MCPClient for the three servers, signed in with the agent user's application password. */
export function createFluentClient(
  { url, user, appPassword }: FluentConfig,
  /** MCPClient refuses two clients with the same config and no id; tests pass their own. */
  id = 'fluent',
): MCPClient {
  const base = url.replace(/\/$/, '');
  const authorization = `Basic ${Buffer.from(`${user}:${appPassword}`).toString('base64')}`;
  return new MCPClient({
    id,
    servers: Object.fromEntries(
      Object.entries(FLUENT_SERVERS).map(([key, route]) => {
        const endpoint = new URL(`${base}/wp-json/${route}`);
        return [
          key,
          {
            url: endpoint,
            requestInit: { headers: { Authorization: authorization } },
            // The password is only ever sent to her site, never to a redirect target.
            allowedHosts: [endpoint.host],
          },
        ];
      }),
    ),
  });
}

type Definition = Awaited<ReturnType<MCPClient['listToolDefinitions']>>[string][string];
type JsonSchema = {
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  [key: string]: unknown;
};

/** Drop `names` from an object schema's properties and required list. */
function withoutInputs(schema: JsonSchema, names: readonly string[]): JsonSchema {
  const removed = new Set(names);
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties ?? {}).filter(([key]) => !removed.has(key)),
    ),
    ...(schema.required ? { required: schema.required.filter((k) => !removed.has(k)) } : {}),
  };
}

/** True when a tool's schema carries the dry-run guard (see GUARD_INPUTS). */
export function isGuarded(definition: Definition): boolean {
  const properties = (definition.inputSchema as JsonSchema).properties ?? {};
  return 'confirm_token' in properties;
}

/**
 * A definition as the agent is offered it: RESTRICTIONS applied, and on a guarded write the
 * guard's inputs removed (the tool supplies them). Writes get `additionalProperties: false`,
 * so a removed input is not just hidden from the model: a call that still sends one fails the
 * tool's input validation and never reaches WordPress.
 */
export function restrictDefinition(definition: Definition): Definition {
  const rule = RESTRICTIONS[definition.name] ?? {};
  const guarded = isGuarded(definition);
  let schema = withoutInputs(definition.inputSchema as JsonSchema, [
    ...(rule.remove ?? []),
    ...(guarded ? GUARD_INPUTS : []),
  ]);
  for (const [input, allowed] of Object.entries(rule.enums ?? {})) {
    const property = schema.properties?.[input];
    if (property) {
      schema = {
        ...schema,
        properties: { ...schema.properties, [input]: { ...property, enum: allowed } },
      };
    }
  }
  const write = (FLUENT_WRITE_TOOLS as readonly string[]).includes(definition.name);
  return {
    ...definition,
    ...(guarded
      ? {
          description: `${definition.description ?? ''}\n\nIn this chat the approval card is the confirmation: call this tool once, without dry_run or confirm_token. Once the user approves, it previews and confirms the change itself.`,
        }
      : {}),
    inputSchema: write ? { ...schema, additionalProperties: false } : schema,
  };
}

/** The `confirm_token` in a dry run's result, wherever the plugin put it. */
export function findConfirmToken(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const record = result as Record<string, unknown>;
  if (typeof record.confirm_token === 'string') return record.confirm_token;
  for (const value of Object.values(record)) {
    const found = findConfirmToken(value);
    if (found) return found;
  }
  // A result with no structuredContent comes back as MCP text content holding JSON.
  const content = record.content;
  if (Array.isArray(content)) {
    for (const part of content as { type?: string; text?: string }[]) {
      if (part?.type !== 'text' || !part.text) continue;
      try {
        const found = findConfirmToken(JSON.parse(part.text));
        if (found) return found;
      } catch {
        // not JSON
      }
    }
  }
  return undefined;
}

type MCPTool = { execute: (input: unknown, context?: unknown) => Promise<unknown> };

/**
 * A guarded write as one tool (see GUARD_INPUTS). It runs only after the approval card:
 * first the dry run, then, with the token it returns, the same call for real. A dry run that
 * fails (bad input, no permission) is what the agent gets back, and nothing changes.
 */
function guardedWriteTool(definition: Definition, server: MCPTool) {
  const offered = restrictDefinition(definition);
  return createTool({
    id: definition.name,
    description: offered.description ?? '',
    inputSchema: offered.inputSchema as Record<string, unknown>,
    execute: async (input, context) => {
      const args = (input ?? {}) as Record<string, unknown>;
      const preview = await server.execute({ ...args, dry_run: true }, context);
      const confirm_token = findConfirmToken(preview);
      if (!confirm_token) return preview;
      return server.execute({ ...args, confirm_token, idempotency_key: randomUUID() }, context);
    },
  });
}

/**
 * The offered Fluent tools from a client, or `{}` for a server that can't be reached or
 * refuses the password (a server that answers keeps its tools when another is down). A
 * Fluent error during a call (no such contact, no permission) comes back as a tool error the
 * agent can read.
 */
export async function loadFluentTools(client: MCPClient): Promise<ToolsInput> {
  const { definitions, errors } = await client.listToolDefinitionsWithErrors({
    perServerTimeoutMs: DISCOVERY_TIMEOUT_MS,
  });
  for (const [server, error] of Object.entries(errors)) {
    console.warn(`Fluent ${server} tools unavailable: ${error}`);
  }
  const tools: ToolsInput = {};
  for (const name of [...FLUENT_READ_TOOLS, ...FLUENT_WRITE_TOOLS]) {
    const serverName = serverOf(name);
    const definition = definitions[serverName]?.[name];
    if (!definition) continue;
    if (isGuarded(definition)) {
      // The executable tool keeps the full schema: it is the one that sends the guard's inputs.
      const server = (await client.toolFromDefinition({ serverName, definition })) as MCPTool;
      tools[name] = guardedWriteTool(definition, server);
    } else {
      tools[name] = await client.toolFromDefinition({
        serverName,
        definition: restrictDefinition(definition),
      });
    }
  }
  return tools;
}

/** The live server's config from env, or null when any of the three settings is unset. */
export function fluentConfigFromEnv(): FluentConfig | null {
  const { WORDPRESS_URL, WORDPRESS_MCP_USER, WORDPRESS_MCP_APP_PASSWORD } = env;
  return WORDPRESS_URL && WORDPRESS_MCP_USER && WORDPRESS_MCP_APP_PASSWORD
    ? { url: WORDPRESS_URL, user: WORDPRESS_MCP_USER, appPassword: WORDPRESS_MCP_APP_PASSWORD }
    : null;
}

let client: MCPClient | null = null;
let loaded: ToolsInput | null = null;
let pending: Promise<ToolsInput> | null = null;
let failedAt = 0;
/** The tools of the servers that answered, used while the others are backed off. */
let partial: ToolsInput = {};

/**
 * The live Fluent tools, or `{}` when WordPress is not configured. A listing with every
 * server's tools is kept. A failed or partial one is not retried for DISCOVERY_BACKOFF_MS, so
 * a down site costs one wait, not one per send, approve or decline; a partial one is still
 * used meanwhile. Concurrent callers share one discovery.
 */
export async function getFluentTools(now: () => number = Date.now): Promise<ToolsInput> {
  const config = fluentConfigFromEnv();
  if (!config) return {};
  if (loaded) return loaded;
  if (failedAt && now() - failedAt < DISCOVERY_BACKOFF_MS) return partial;
  if (!pending) {
    client ??= createFluentClient(config);
    pending = loadFluentTools(client)
      .then((tools) => {
        const servers = new Set(Object.keys(tools).map(serverOf));
        if (servers.size === Object.keys(FLUENT_SERVERS).length) {
          loaded = tools;
          failedAt = 0;
        } else {
          partial = tools;
          failedAt = now();
        }
        return tools;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Close the live client's connections (tests; a server restart just drops them). */
export async function disconnectFluent(): Promise<void> {
  const open = client;
  client = null;
  loaded = null;
  pending = null;
  partial = {};
  failedAt = 0;
  await open?.disconnect();
}

/**
 * The approval category of a Fluent tool, for the controller's `toolCategoryResolver`:
 * reads are `read`, writes `edit`, and the booking writes (they notify people) `null`, so an
 * "Always allow" approves just that one call. Undefined for a tool that is not a Fluent one.
 */
export function fluentToolCategory(name: string): ToolCategory | null | undefined {
  if ((FLUENT_READ_TOOLS as readonly string[]).includes(name)) return 'read';
  if (!(FLUENT_WRITE_TOOLS as readonly string[]).includes(name)) return undefined;
  return ALWAYS_ASK.has(name) ? null : 'edit';
}

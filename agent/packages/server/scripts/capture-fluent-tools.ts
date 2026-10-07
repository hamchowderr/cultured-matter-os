/**
 * Refresh fixtures/fluent-mcp-tools.json: the tool lists Simone's FluentCRM, Fluent Forms and
 * Fluent Booking MCP servers advertise, which the tests serve from AIMock's MCP mock
 * (scripts/fluent-mock.ts) in place of WordPress.
 *
 *   infisical run --env dev --path=/cultured-matter-agent -- \
 *     pnpm --filter @mastra-chat-kit/server exec tsx scripts/capture-fluent-tools.ts
 *   pnpm exec biome format --write packages/server/fixtures/fluent-mcp-tools.json
 *
 * It signs in as the agent's WordPress user (WORDPRESS_URL, WORDPRESS_MCP_USER,
 * WORDPRESS_MCP_APP_PASSWORD) and only lists tools, which reads no CRM, form or booking data.
 *
 * The agent offers only lib/fluent.ts's FLUENT_READ_TOOLS and FLUENT_WRITE_TOOLS, so those
 * keep their full definitions. Every other tool is cut to its name and an empty object
 * schema, which is enough to prove the agent leaves it out.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/lib/env.ts validates at import; this script needs only the WordPress settings.
process.env.APP_SECRET ??= 'capture-script-placeholder-secret-0000000000';
process.env.ANTHROPIC_API_KEY ??= 'unused';
const {
  FLUENT_READ_TOOLS,
  FLUENT_WRITE_TOOLS,
  FLUENT_SERVERS,
  createFluentClient,
  fluentConfigFromEnv,
} = await import('../src/mastra/lib/fluent');

const config = fluentConfigFromEnv();
if (!config)
  throw new Error('Set WORDPRESS_URL, WORDPRESS_MCP_USER and WORDPRESS_MCP_APP_PASSWORD');

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/fluent-mcp-tools.json',
);

const mcp = createFluentClient(config, 'fluent-capture');
const { definitions, errors } = await mcp.listToolDefinitionsWithErrors({
  perServerTimeoutMs: 30_000,
});
await mcp.disconnect();
if (Object.keys(errors).length) throw new Error(JSON.stringify(errors));

const offered = new Set<string>([...FLUENT_READ_TOOLS, ...FLUENT_WRITE_TOOLS]);
const servers = Object.fromEntries(
  Object.keys(FLUENT_SERVERS).map((server) => [
    server,
    Object.values(definitions[server] ?? {}).map((def) =>
      offered.has(def.name)
        ? {
            name: def.name,
            description: def.description,
            inputSchema: def.inputSchema,
            outputSchema: def.outputSchema,
            annotations: def.annotations,
          }
        : { name: def.name, inputSchema: { type: 'object' } },
    ),
  ]),
);

writeFileSync(
  out,
  `${JSON.stringify({ _source: `${config.url} tools/list (Streamable HTTP), ${new Date().toISOString().slice(0, 10)}`, servers }, null, 2)}\n`,
);
console.log(
  `wrote ${Object.values(servers)
    .map((tools) => tools.length)
    .join(' + ')} tools to ${out}`,
);

import { createTool } from '@mastra/core/tools';

/**
 * # Her website's pages (Cultured Matter)
 *
 * The site's own MCP server (`/wp-json/cultured-matter/mcp`, from the
 * cultured-matter-headless plugin, on the same MCP Adapter and application password as the
 * Fluent servers; lib/fluent.ts connects it) lists four tools: list-pages and get-page read,
 * update-page changes existing blocks of a page, and create-page makes a new DRAFT. There is
 * no delete tool, and the agent's WordPress user has no delete_pages capability.
 *
 * update-page is offered in a different shape from the server's, so its approval card shows
 * what the page says now and what it will say: each change carries `before` and `after`, and
 * the call names the page's address and whether it is published (`live`). Once Simone
 * approves, the tool asks WordPress for a dry run of exactly that change and saves it only if
 * WordPress reports the same page, address and published state, the same
 * `before` and the same `after` the card showed. If the page changed in the meantime, or
 * WordPress would store the text differently, nothing is saved and the agent gets the real
 * before/after to show her again.
 *
 * One allowance: models type the site's curly quotes and dashes plainly ("We're" for
 * "We’re"). A `before` that differs from the page only that way still matches, and the
 * edit is applied to the page's own text, so the words the card did not change keep their
 * typography (onPageText).
 */

export const PAGE_READ_TOOLS = ['cultured-matter-list-pages', 'cultured-matter-get-page'] as const;

export const PAGE_WRITE_TOOLS = [
  'cultured-matter-update-page',
  'cultured-matter-create-page',
] as const;

/** The block fields update-page can change (text and buttons: text/href; images: url/alt). */
const FIELDS = ['text', 'href', 'url', 'alt', 'html'] as const;
type Field = (typeof FIELDS)[number];
type Content = Partial<Record<Field, string>>;

const contentSchema = (what: string) => ({
  type: 'object',
  description: what,
  properties: {
    text: {
      type: 'string',
      description: 'Text blocks and button labels (inline HTML: em, strong, a, br).',
    },
    href: { type: 'string', description: "A button's link." },
    url: { type: 'string', description: "An image's URL (a media library image)." },
    alt: { type: 'string', description: "An image's alt text." },
    html: { type: 'string', description: 'A Custom HTML block.' },
  },
  additionalProperties: false,
});

/** The input the agent gives update-page (and the approval card shows). */
export const UPDATE_PAGE_INPUT = {
  type: 'object',
  properties: {
    id: { type: 'integer', description: 'Page ID (from list-pages or get-page).' },
    page: {
      type: 'string',
      description:
        'The page\'s address on the site, from get-page\'s "path" ("/" is the home page). For a page with no address yet (path null), "none".',
    },
    live: {
      type: 'boolean',
      description:
        'Whether the page is published (get-page\'s status "publish"), so the change shows on the site straight away. False for a draft, which is not on the site.',
    },
    title: {
      type: 'object',
      description: 'Only to change the page title.',
      properties: { before: { type: 'string' }, after: { type: 'string' } },
      required: ['before', 'after'],
      additionalProperties: false,
    },
    changes: {
      type: 'array',
      description: 'One entry per block to change.',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The block\'s "path" from get-page.' },
          before: contentSchema(
            'What the block says now, copied exactly from get-page: the same fields as `after`.',
          ),
          after: contentSchema('What it should say: only the fields that change.'),
        },
        required: ['path', 'before', 'after'],
        additionalProperties: false,
      },
    },
  },
  required: ['id', 'page', 'live'],
  additionalProperties: false,
} as const;

export type UpdatePageInput = {
  id: number;
  page: string;
  live: boolean;
  title?: { before: string; after: string };
  changes?: { path: string; before: Content; after: Content }[];
};

/** update-page's result, from the server (the same shape for a dry run and a save). */
type UpdatePageResult = {
  id: number;
  status?: string;
  /** Where the page is (or will be once published); null when it has no slug yet. */
  path?: string | null;
  title?: { before: string; after: string };
  changes?: { path: string; before: Content; after: Content }[];
  saved?: boolean;
};

type ServerTool = { execute: (input: unknown, context?: unknown) => Promise<unknown> };

/**
 * A result as the server's JSON object. With an output schema MCPClient returns the
 * `structuredContent` itself; without one (a mock) it returns the MCP envelope, whose text
 * part carries the same JSON.
 */
export function structured(result: unknown): UpdatePageResult {
  const envelope = result as { content?: { type?: string; text?: string }[] } | null;
  if (envelope && Array.isArray(envelope.content) && !('changes' in envelope)) {
    const text = envelope.content.find((part) => part?.type === 'text')?.text;
    if (text) return JSON.parse(text) as UpdatePageResult;
  }
  return (result ?? {}) as UpdatePageResult;
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/**
 * Typography a model tends to type plainly (a curly apostrophe as a straight one), each
 * mapped to ONE plain character, so a text and its plain form have the same length.
 */
const PLAIN: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
};
const plain = (text: string) => text.replace(/[‘’‚‛′“”„″–— ]/g, (c) => PLAIN[c] ?? c);

/**
 * The text to save for one field. When the card's `before` is exactly what the page says,
 * that is the card's `after`. When it differs only in typography the model typed plainly,
 * the card's edit (what changed between its before and after) is applied to the page's own
 * text, so the parts the edit does not touch keep their curly quotes and dashes. Null when
 * the page says something else.
 */
export function onPageText(
  cardBefore: string,
  cardAfter: string,
  pageBefore: string,
): string | null {
  const before = cardBefore.trim();
  const after = cardAfter.trim();
  const page = pageBefore.trim();
  if (before === page) return after;
  if (plain(before) !== plain(page)) return null;
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  return (
    page.slice(0, prefix) +
    after.slice(prefix, after.length - suffix) +
    page.slice(page.length - suffix)
  );
}

type Resolved = { title?: string; changes: { path: string; after: Content }[] };

/**
 * What to save, from the card and a dry run of it: the page's own text with the card's edits
 * (onPageText). `problems` says, in sentences the agent can relay, where the page no longer
 * says what the card showed as `before`.
 */
export function resolveAgainstPage(
  input: UpdatePageInput,
  dry: UpdatePageResult,
): { resolved: Resolved; problems: string[] } {
  const problems: string[] = [];
  const resolved: Resolved = { changes: [] };
  // The card names the page by address and says whether the change goes live.
  const address = dry.path === null ? 'none' : dry.path;
  if (address !== undefined && !same(address, input.page)) {
    problems.push(
      dry.path === null
        ? `Page ${input.id} has no address yet.`
        : `Page ${input.id} is at "${dry.path}", not "${input.page}".`,
    );
  }
  if (dry.status !== undefined && (dry.status === 'publish') !== input.live) {
    problems.push(
      dry.status === 'publish'
        ? `Page ${input.id} is published: the change would show on the site straight away.`
        : `Page ${input.id} is not published (status ${dry.status}): the change would not show on the site.`,
    );
  }
  if (input.title) {
    const title = onPageText(input.title.before, input.title.after, dry.title?.before ?? '');
    if (title === null) problems.push(`The title is now "${dry.title?.before ?? ''}".`);
    else resolved.title = title;
  }
  for (const change of input.changes ?? []) {
    const actual = dry.changes?.find((c) => c.path === change.path);
    if (!actual) {
      problems.push(`WordPress reported no change at block ${change.path}.`);
      continue;
    }
    const after: Content = {};
    for (const field of Object.keys(change.after) as Field[]) {
      const text = onPageText(
        change.before[field] ?? '',
        change.after[field] ?? '',
        actual.before?.[field] ?? '',
      );
      if (text === null) {
        problems.push(
          `Block ${change.path} ${field} is now: ${JSON.stringify(actual.before?.[field] ?? '')}.`,
        );
      } else {
        after[field] = text;
      }
    }
    resolved.changes.push({ path: change.path, after });
  }
  return { resolved, problems };
}

/** Where a dry run would store something other than `resolved` (WordPress filters some HTML). */
export function storedDifferently(resolved: Resolved, dry: UpdatePageResult): string[] {
  const problems: string[] = [];
  if (resolved.title !== undefined && !same(dry.title?.after, resolved.title)) {
    problems.push(`WordPress would save the title as "${dry.title?.after ?? ''}".`);
  }
  for (const change of resolved.changes) {
    const actual = dry.changes?.find((c) => c.path === change.path);
    for (const field of Object.keys(change.after) as Field[]) {
      if (!same(actual?.after?.[field], change.after[field])) {
        problems.push(
          `WordPress would save block ${change.path} ${field} as: ${JSON.stringify(actual?.after?.[field] ?? '')}.`,
        );
      }
    }
  }
  return problems;
}

/** The server's update-page arguments. */
function serverRequest(id: number, resolved: Resolved) {
  return {
    id,
    ...(resolved.title !== undefined ? { title: resolved.title } : {}),
    ...(resolved.changes.length
      ? { changes: resolved.changes.map((c) => ({ path: c.path, ...c.after })) }
      : {}),
  };
}

/**
 * update-page as the agent is offered it (see the module comment). `server` is the MCP tool
 * built from the server's own definition, which takes `changes: [{path, text, …}]` and
 * `dry_run`.
 */
export function updatePageTool(description: string, server: ServerTool) {
  const tool = createTool({
    id: 'cultured-matter-update-page',
    description: `${description}\n\nIn this chat, give each change's "before" (copied exactly from get-page) and "after", the page's address from get-page as "page", and whether the page is published as "live", so the approval card shows the change and whether it goes live. Pass "title" only to change the title. Once the user approves, the change is checked against the page and saved; if the page no longer matches "before", nothing is saved and you get what it says now.`,
    inputSchema: UPDATE_PAGE_INPUT as unknown as Record<string, unknown>,
    execute: async (raw, context) => {
      const input = raw as UpdatePageInput;
      if (!input.title && !input.changes?.length) {
        return { error: 'Nothing to change: give "changes" or "title".' };
      }
      const refuse = (problems: string[], current: UpdatePageResult) => ({
        saved: false,
        error: `Nothing was saved: the page does not match what the approval card showed. ${problems.join(' ')}`,
        current,
      });
      const card: Resolved = {
        ...(input.title ? { title: input.title.after } : {}),
        changes: (input.changes ?? []).map((c) => ({ path: c.path, after: c.after })),
      };
      const cardRequest = serverRequest(input.id, card);
      const preview = structured(await server.execute({ ...cardRequest, dry_run: true }, context));
      const { resolved, problems } = resolveAgainstPage(input, preview);
      if (problems.length) return refuse(problems, preview);
      const request = serverRequest(input.id, resolved);
      // When the page's own typography changed the text to save, preview that text too.
      const dry =
        JSON.stringify(request) === JSON.stringify(cardRequest)
          ? preview
          : structured(await server.execute({ ...request, dry_run: true }, context));
      const stored = storedDifferently(resolved, dry);
      if (stored.length) return refuse(stored, dry);
      return server.execute(request, context);
    },
  });
  // The dry run of exactly what the card asks for, before the card is shown: the page as it
  // is (address, published or not) and each block's text before and after.
  return Object.assign(tool, {
    preview: async (raw: unknown) => {
      const input = raw as UpdatePageInput;
      const card: Resolved = {
        ...(input.title ? { title: input.title.after } : {}),
        changes: (input.changes ?? []).map((c) => ({ path: c.path, after: c.after })),
      };
      const dry = structured(
        await server.execute({ ...serverRequest(input.id, card), dry_run: true }, {}),
      );
      return {
        path: dry.path ?? null,
        status: dry.status ?? null,
        title: dry.title ?? null,
        changes: (dry.changes ?? []).map((c) => ({ path: c.path, before: c.before, after: c.after })),
      };
    },
  });
}

import type { ActionContext } from "@/actions/define";
import { importNotes } from "@/actions/notes";
import { authorized, readForm } from "@/lib/capture";
import { type IncomingNote, MAX_BODY, MAX_TITLE } from "@/lib/note-dedupe";

export { dedupeKey, type IncomingNote } from "@/lib/note-dedupe";

// Apple Notes import. A Shortcut on the iPhone or Mac reads notes with Find Notes and posts them
// here, one note or a batch per request (docs/apple-notes-shortcut.md). Shortcuts gives each note
// a name, a plain-text body, a folder and its creation and last-modified dates, but no stable id,
// so a note is recognised again by its creation time plus its title (lib/note-dedupe.ts).

// Most notes a single request may carry. Vercel also caps a request body at 4.5 MB.
export const MAX_BATCH = 200;

// Spaces Shortcuts puts in formatted dates ("Oct 3, 2026 at 9:58 PM" uses a narrow no-break
// space before PM) and the zero-width characters pasted text can carry.
const ODD_SPACES = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;

const clean = (s: string) => s.replace(INVISIBLE, "").replace(ODD_SPACES, " ");

// ISO 8601 (what the Shortcut sends when the date's format is set to ISO 8601), epoch numbers,
// or the default Shortcuts text ("Oct 3, 2026 at 9:58 PM"). Anything else is no date.
export function parseNoteDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;
  const s = clean(value).trim();
  if (!s) return null;
  if (/^\d{9,13}$/.test(s)) return parseNoteDate(Number(s));
  const d = new Date(s.replace(/\s+at\s+/i, " ").replace(/\s+/g, " "));
  return Number.isNaN(d.getTime()) ? null : d;
}

const NAMES = {
  title: ["title", "name"],
  body: ["body", "text", "content", "plaintext"],
  folder: ["folder", "foldername"],
  created: ["created", "createdat", "creationdate", "creation date", "datecreated"],
  modified: [
    "modified",
    "modifiedat",
    "updated",
    "lastmodified",
    "lastmodifieddate",
    "modificationdate",
    "last modified date",
    "datemodified"
  ]
};

function pick(obj: Record<string, unknown>, names: string[]) {
  for (const [k, v] of Object.entries(obj)) {
    if (names.includes(clean(k).trim().toLowerCase().replace(/[_-]/g, ""))) return v;
    if (names.includes(clean(k).trim().toLowerCase())) return v;
  }
  return undefined;
}

const asText = (v: unknown) => (v == null ? "" : clean(String(v)));

// Shortcuts sends the body as plain text. If rich text arrives as HTML (a Shortcut that used
// Make HTML from Rich Text), keep the words and the line breaks.
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const looksLikeHtml = (s: string) => /^\s*</.test(s) && /<\/(p|div|span|body|li|h\d)>/i.test(s);

// One note as sent, in whatever shape: null when it carries neither a title nor a body.
export function normalizeNote(raw: unknown): IncomingNote | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  let body = asText(pick(obj, NAMES.body)).replace(/\r\n?/g, "\n");
  if (looksLikeHtml(body)) body = htmlToText(body);
  body = body.trim().slice(0, MAX_BODY);
  // Notes calls the first line of a note its name; a missing name falls back to that line.
  let title = asText(pick(obj, NAMES.title)).replace(/\s+/g, " ").trim();
  if (!title)
    title =
      body
        .split("\n")
        .find((l) => l.trim())
        ?.trim() ?? "";
  if (!title && !body) return null;
  const folder = asText(pick(obj, NAMES.folder)).trim();
  return {
    title: (title || "Untitled").slice(0, MAX_TITLE),
    body,
    folder: folder || null,
    createdAt: parseNoteDate(pick(obj, NAMES.created)),
    modifiedAt: parseNoteDate(pick(obj, NAMES.modified))
  };
}

// Reads every JSON value in a text: one object, an array, or several objects one after another
// (a Shortcuts list of Dictionaries turned into Text puts one JSON object per line).
export function parseJsonValues(input: string): unknown[] {
  const s = input.replace(INVISIBLE, "").trim();
  if (!s) return [];
  try {
    return [JSON.parse(s)];
  } catch {}
  const values: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0 && start >= 0) {
        values.push(JSON.parse(s.slice(start, i + 1)));
        start = -1;
      }
      if (depth < 0) throw new SyntaxError("Unbalanced JSON");
    }
  }
  if (depth !== 0) throw new SyntaxError("Unfinished JSON");
  return values;
}

// Flattens what was sent into a list of note-shaped objects. Accepts a note, a list of notes,
// or {notes: [...]} where the list may itself be a JSON text.
function collect(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out);
  } else if (typeof value === "string" && /^\s*[[{]/.test(value)) {
    for (const v of parseJsonValues(value)) collect(v, out);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const list = pick(obj, ["notes", "batch", "items"]);
    if (list !== undefined) collect(list, out);
    else out.push(obj);
  } else {
    // Not a note; kept so the reply counts it as skipped.
    out.push(value);
  }
  return out;
}

export type ParsedNotes = { notes: unknown[]; key?: string };

const keyOf = (v: unknown) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const k = pick(v as Record<string, unknown>, ["key"]);
  return typeof k === "string" ? k : undefined;
};

// The request body: JSON, a Form (fields of one note, or a "notes" field holding the batch as
// JSON text), or the batch as plain text. The key may ride along as a "key" field.
export async function parseNotesRequest(type: string, raw: Uint8Array): Promise<ParsedNotes> {
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);
  const lower = type.toLowerCase();
  if (lower.includes("multipart/form-data") || lower.includes("application/x-www-form-urlencoded")) {
    const fields: Record<string, string> = {};
    for (const [name, value] of await readForm(type, raw)) {
      const v =
        typeof value === "string" ? value : decode(new Uint8Array(await value.arrayBuffer()));
      fields[name] = v;
    }
    const { key, ...rest } = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k.trim().toLowerCase() === "key" ? "key" : k, v])
    );
    return { notes: collect(rest), key };
  }
  const values = parseJsonValues(decode(raw));
  return { notes: collect(values), key: values.map(keyOf).find(Boolean) };
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });

export async function handleNotesImport(request: Request, deps: { ctx?: ActionContext } = {}) {
  // Read the whole request before answering: an early reply makes iOS report "The network
  // connection was lost".
  const raw = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  // Not lowercased: the multipart boundary is case-sensitive.
  const type = request.headers.get("content-type") ?? "";
  let parsed: ParsedNotes | null = null;
  try {
    parsed = await parseNotesRequest(type, raw);
  } catch (e) {
    console.warn("Notes import: could not parse request", {
      type,
      bytes: raw.length,
      e: String(e)
    });
  }
  if (!authorized(request, parsed?.key)) {
    return json({ ok: false, error: "Unauthorized. Check the key in your Shortcut." }, 401);
  }
  if (!parsed) return json({ ok: false, error: "Couldn't read those notes." }, 400);

  const notes = parsed.notes.map(normalizeNote).filter((n): n is IncomingNote => !!n);
  const skipped = parsed.notes.length - notes.length;
  if (notes.length === 0) {
    return json({ ok: false, error: "No notes in that request.", received: 0 }, 400);
  }
  if (notes.length > MAX_BATCH) {
    return json({ ok: false, error: `Send at most ${MAX_BATCH} notes at a time.` }, 413);
  }
  const result = await importNotes.run({ notes }, deps.ctx);
  return json({ ok: true, received: parsed.notes.length, ...result, skipped }, 200);
}

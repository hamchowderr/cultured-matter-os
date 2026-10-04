import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { captures, notes } from "@/db/schema";
import { decide, dedupeKey, MAX_BODY, MAX_TITLE } from "@/lib/note-dedupe";
import { ActionError, defineAction } from "./define";
import { captureSchema, id, limit, offset } from "./schemas";

export const noteSchema = createSelectSchema(notes);
export type Note = z.infer<typeof noteSchema>;

// A note in a list: the body is cut to a preview.
export const noteSummarySchema = noteSchema.omit({ body: true }).extend({
  preview: z.string(),
  // Whether the body came through empty (locked notes arrive with the title only).
  empty: z.boolean()
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

const incomingNote = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE),
  body: z.string().max(MAX_BODY).default(""),
  folder: z.string().trim().max(200).nullable().default(null),
  createdAt: z.coerce.date().nullable().default(null),
  modifiedAt: z.coerce.date().nullable().default(null)
});

// Same limit as createCapture's body.
const MAX_CAPTURE = 10_000;
const PREVIEW = 280;

export const importNotes = defineAction({
  name: "importNotes",
  description:
    "Add or update notes in the Notes archive (from the Apple Notes Shortcut). A note seen before is updated when it was edited since, never duplicated.",
  kind: "write",
  input: z.object({ notes: z.array(incomingNote).min(1).max(200) }),
  output: z.object({
    added: z.number(),
    updated: z.number(),
    unchanged: z.number()
  }),
  async handler(input, db) {
    // The same note twice in one batch: the later copy wins.
    const byKey = new Map(input.notes.map((n) => [dedupeKey(n), n]));
    const keys = [...byKey.keys()];
    const existing = await db
      .select({
        id: notes.id,
        dedupeKey: notes.dedupeKey,
        title: notes.title,
        body: notes.body,
        folder: notes.folder,
        noteModifiedAt: notes.noteModifiedAt
      })
      .from(notes)
      .where(inArray(notes.dedupeKey, keys));
    const found = new Map(existing.map((r) => [r.dedupeKey, r]));

    const result = { added: 0, updated: 0, unchanged: input.notes.length - byKey.size };
    const toInsert: (typeof notes.$inferInsert)[] = [];
    for (const [key, n] of byKey) {
      const row = found.get(key);
      const verdict = decide(row, n);
      if (verdict === "add") {
        toInsert.push({
          dedupeKey: key,
          title: n.title,
          body: n.body,
          folder: n.folder,
          noteCreatedAt: n.createdAt,
          noteModifiedAt: n.modifiedAt
        });
        result.added++;
      } else if (verdict === "update" && row) {
        await db
          .update(notes)
          .set({
            title: n.title,
            body: n.body,
            folder: n.folder,
            noteModifiedAt: n.modifiedAt ?? row.noteModifiedAt
          })
          .where(eq(notes.id, row.id));
        result.updated++;
      } else {
        result.unchanged++;
      }
    }
    // New notes go in a few statements rather than one each: on Turso every statement is a
    // round trip, and the Shortcut is waiting for the reply.
    for (let i = 0; i < toInsert.length; i += 50) {
      await db.insert(notes).values(toInsert.slice(i, i + 50));
    }
    return result;
  },
  log: (input, r) => ({
    entityType: "note",
    summary: `Imported ${input.notes.length} ${input.notes.length === 1 ? "note" : "notes"} from Apple Notes (${r.added} new, ${r.updated} updated)`,
    data: r
  })
});

const searchInput = z.object({
  query: z.string().trim().max(200).optional(),
  folder: z.string().max(200).optional(),
  // Notes with no folder.
  noFolder: z.boolean().optional(),
  // Creation date range in Apple Notes, from inclusive, to exclusive.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit,
  offset
});

export const searchNotes = defineAction({
  name: "searchNotes",
  description:
    "Search the Notes archive (imported Apple Notes) by words in the title or text, folder and creation date. Newest first.",
  kind: "read",
  input: searchInput,
  output: z.object({
    notes: z.array(noteSummarySchema),
    total: z.number(),
    // Every folder with its note count, for the folder list.
    folders: z.array(z.object({ folder: z.string().nullable(), count: z.number() })),
    all: z.number()
  }),
  async handler(input, db) {
    const words = (input.query ?? "").split(/\s+/).filter(Boolean).slice(0, 8);
    const where = and(
      ...words.map((w) => {
        const pattern = `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        return or(
          sql`${notes.title} like ${pattern} escape '\\'`,
          sql`${notes.body} like ${pattern} escape '\\'`
        );
      }),
      input.noFolder
        ? isNull(notes.folder)
        : input.folder
          ? eq(notes.folder, input.folder)
          : undefined,
      input.from ? gte(notes.noteCreatedAt, input.from) : undefined,
      input.to ? lt(notes.noteCreatedAt, input.to) : undefined
    );
    const [rows, [{ n }], folders] = await Promise.all([
      db
        .select({
          note: notes,
          preview: sql<string>`substr(${notes.body}, 1, ${PREVIEW})`
        })
        .from(notes)
        .where(where)
        // Notes without a creation date go last.
        .orderBy(sql`${notes.noteCreatedAt} is null`, desc(notes.noteCreatedAt), asc(notes.title))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(notes).where(where),
      db
        .select({ folder: notes.folder, count: count() })
        .from(notes)
        .groupBy(notes.folder)
        .orderBy(asc(notes.folder))
    ]);
    return {
      notes: rows.map(({ note: { body, ...rest }, preview }) => ({
        ...rest,
        preview,
        empty: body.trim() === ""
      })),
      total: n,
      folders,
      all: folders.reduce((sum, f) => sum + f.count, 0)
    };
  }
});

export const getNote = defineAction({
  name: "getNote",
  description: "One note from the Notes archive, with its full text.",
  kind: "read",
  input: z.object({ noteId: id }),
  output: noteSchema.extend({ filed: z.boolean() }),
  async handler(input, db) {
    const [row] = await db
      .select({ note: notes, captureId: captures.id })
      .from(notes)
      .leftJoin(captures, eq(notes.captureId, captures.id))
      .where(eq(notes.id, input.noteId));
    if (!row) throw new ActionError("not_found", "Note not found");
    return { ...row.note, filed: !!row.captureId };
  }
});

// What lands in the Inbox: the title, then the text, cut to the Inbox's limit.
export function noteToCaptureBody(note: { title: string; body: string }) {
  const body = note.body.trim();
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  // Apple Notes repeats the title as the first line of the body.
  const rest = firstLine === note.title.trim() ? body.slice(body.indexOf("\n") + 1).trim() : body;
  const text = rest && rest !== note.title ? `${note.title}\n\n${rest}` : note.title;
  return text.length > MAX_CAPTURE ? `${text.slice(0, MAX_CAPTURE - 1)}…` : text;
}

export const fileNoteToInbox = defineAction({
  name: "fileNoteToInbox",
  description:
    "Copy a note from the Notes archive into the Inbox, to sort it as a task, idea or reference. A note already in the Inbox is not copied twice.",
  kind: "write",
  input: z.object({ noteId: id }),
  output: captureSchema,
  async handler(input, db) {
    const [note] = await db.select().from(notes).where(eq(notes.id, input.noteId));
    if (!note) throw new ActionError("not_found", "Note not found");
    if (note.captureId) {
      const [existing] = await db
        .select({ id: captures.id })
        .from(captures)
        .where(eq(captures.id, note.captureId));
      if (existing) throw new ActionError("conflict", "This note is already in the Inbox.");
    }
    const [capture] = await db
      .insert(captures)
      .values({ body: noteToCaptureBody(note) })
      .returning();
    await db.update(notes).set({ captureId: capture.id }).where(eq(notes.id, note.id));
    return capture;
  },
  log: (_input, capture) => ({
    entityType: "capture",
    entityId: capture.id,
    summary: `Filed the note "${capture.body.split("\n")[0].slice(0, 60)}" to the Inbox`,
    data: { from: "notes" }
  })
});

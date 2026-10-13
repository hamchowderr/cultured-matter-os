import { getSchema } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createNote, deleteNote, importNotes, searchNotes, updateNote } from "@/actions/notes";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  editorStart,
  previewFromMarkdown,
  titleFromMarkdown,
  toEditorMarkdown
} from "@/lib/note-markdown";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());
beforeEach(async () => {
  await db.delete(t.notes);
  await db.delete(t.activityLog);
});

// The same extensions the editor uses (note-editor.tsx), without a browser.
const extensions = [
  StarterKit.configure({ underline: false }),
  TaskList,
  TaskItem.configure({ nested: true })
];
const markdown = new MarkdownManager({ extensions });
const roundTrip = (md: string) => markdown.serialize(markdown.parse(md));

describe("note text between the database and the editor", () => {
  it("keeps an Apple note's line breaks when it opens in the editor", () => {
    const doc = markdown.parse(toEditorMarkdown("Shopping\nmilk\neggs"));
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].content?.filter((n) => n.type === "hardBreak")).toHaveLength(2);
    expect(getSchema(extensions).nodes.taskList).toBeDefined();
  });

  it("leaves lists, quotes and code blocks alone", () => {
    const md = "Plan\n\n- one\n- two\n\n> said\n\n```\na\nb\n```";
    expect(toEditorMarkdown(md)).toBe(md);
  });

  it("saves formatting as Markdown and reads it back unchanged", () => {
    const md = "Plan  \nfor Monday\n\n- [ ] call Ana\n- [x] book room\n\n**Bold** and *italic*";
    expect(roundTrip(toEditorMarkdown(md))).toBe(md);
    expect(roundTrip(toEditorMarkdown(roundTrip(md)))).toBe(md);
  });

  it("takes the title from the first line, without Markdown marks", () => {
    expect(titleFromMarkdown("## **Gallery** ideas  \nmore")).toBe("Gallery ideas");
    expect(titleFromMarkdown("\n\n- [ ] [Call](https://x.test) the curator")).toBe(
      "Call the curator"
    );
    expect(titleFromMarkdown("   ")).toBe("New note");
  });

  it("previews the text after the title", () => {
    expect(previewFromMarkdown("Plan", "Plan  \n**Monday**: call\n\n- Ana")).toBe(
      "Monday: call Ana"
    );
  });

  it("opens a title-only note with its title", () => {
    expect(editorStart("Locked note", "")).toBe("Locked note");
    expect(editorStart("New note", "")).toBe("");
    expect(editorStart("Trip", "Trip\nBags\nShoes")).toBe("Trip\n\nBags\\\nShoes");
    expect(editorStart("Trip", "Trip  \n\nBags")).toBe("Trip\n\nBags");
    expect(editorStart("Trip", "Bags")).toBe("Trip\n\nBags");
  });
});

describe("writing notes in the app", () => {
  it("creates, edits and deletes a note, with one timeline entry per sitting", async () => {
    const note = await createNote.run({ folder: "Work" }, ctx());
    expect(note).toMatchObject({ title: "New note", body: "", folder: "Work", source: "app" });

    await updateNote.run({ noteId: note.id, body: "Studio list  \nclay" }, ctx());
    const edited = await updateNote.run(
      { noteId: note.id, body: "# Studio list\n\n- clay\n- glaze" },
      ctx()
    );
    expect(edited.title).toBe("Studio list");
    const found = await searchNotes.run({ query: "glaze", limit: 10, offset: 0 }, ctx());
    expect(found.notes.map((n) => n.id)).toEqual([note.id]);

    const log = await db.select().from(t.activityLog).where(eq(t.activityLog.entityId, note.id));
    expect(log.map((l) => l.action).sort()).toEqual(["createNote", "updateNote"]);

    await deleteNote.run({ noteId: note.id }, ctx());
    expect(await db.select().from(t.notes)).toHaveLength(0);
  });

  it("keeps an edit to an imported note until Apple Notes has a newer one", async () => {
    const apple = {
      title: "Gallery ideas",
      body: "Gallery ideas\nCall the curator",
      folder: "Work",
      createdAt: new Date("2024-03-02T18:15:30Z"),
      modifiedAt: new Date("2024-03-05T17:00:00Z")
    };
    await importNotes.run({ notes: [apple] }, ctx());
    const [row] = await db.select().from(t.notes);

    await updateNote.run({ noteId: row.id, body: "Gallery ideas  \nCall Ana first" }, ctx());
    // The Shortcut runs again with the same, older note: the edit here stays.
    expect(await importNotes.run({ notes: [apple] }, ctx())).toMatchObject({ unchanged: 1 });
    const [kept] = await db.select().from(t.notes);
    expect(kept.body).toContain("Call Ana first");

    // Edited later in Apple Notes: that newer text wins.
    const later = {
      ...apple,
      body: "Gallery ideas\nBooked",
      modifiedAt: new Date(Date.now() + 60_000)
    };
    expect(await importNotes.run({ notes: [later] }, ctx())).toMatchObject({ updated: 1 });

    await expect(deleteNote.run({ noteId: row.id }, ctx())).rejects.toThrow(/Apple Notes/);
  });
});

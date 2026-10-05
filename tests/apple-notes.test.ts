import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as A from "@/actions";
import { noteToCaptureBody } from "@/actions/notes";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  handleNotesImport,
  htmlToText,
  normalizeNote,
  parseJsonValues,
  parseNoteDate,
  parseNotesRequest
} from "@/lib/apple-notes";
import { decide, dedupeKey } from "@/lib/note-dedupe";
import { freshDb } from "./test-db";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
// The proxy matcher test only reads proxy.ts's config; skip loading Better Auth behind it.
vi.mock("@/lib/auth", () => ({ auth: {} }));

let db: Database;
let cleanup: () => void;
const KEY = "test-notes-key-0123456789";
const URL_ = "http://localhost/api/apple-notes";

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  process.env.CAPTURE_TOKEN = KEY;
});
afterAll(() => {
  delete process.env.CAPTURE_TOKEN;
  cleanup();
});
beforeEach(async () => {
  await db.delete(t.notes);
});

const ctx = () => ({ ctx: { db } });
const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  handleNotesImport(new Request(URL_, { method: "POST", body, headers }), ctx());
const postJson = (data: unknown, headers: Record<string, string> = {}) =>
  post(JSON.stringify(data), { "Content-Type": "application/json", ...headers });
const allNotes = () => db.select().from(t.notes);

const note = (over: Record<string, unknown> = {}) => ({
  title: "Gallery ideas",
  body: "Gallery ideas\nCall the curator about the spring show",
  folder: "Work",
  created: "2024-03-02T10:15:30-08:00",
  modified: "2024-03-05T09:00:00-08:00",
  ...over
});

describe("parsing what a Shortcut sends", () => {
  it("reads ISO dates, epoch numbers and the default Shortcuts date text", () => {
    expect(parseNoteDate("2024-03-02T10:15:30-08:00")?.toISOString()).toBe(
      "2024-03-02T18:15:30.000Z"
    );
    expect(parseNoteDate(1709403330)?.toISOString()).toBe("2024-03-02T18:15:30.000Z");
    expect(parseNoteDate("1709403330000")?.toISOString()).toBe("2024-03-02T18:15:30.000Z");
    // iOS puts a narrow no-break space before PM.
    const d = parseNoteDate("Mar 2, 2024 at 10:15\u202fAM");
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMinutes()).toBe(15);
    expect(parseNoteDate("not a date")).toBeNull();
    expect(parseNoteDate("")).toBeNull();
  });

  it("accepts the field names Shortcuts and people use", () => {
    const n = normalizeNote({
      Name: "  Trip  list ",
      Body: "Trip list\r\nPassport",
      Folder: "Personal",
      "Creation Date": "2024-01-01T00:00:00Z",
      "Last Modified Date": "2024-01-02T00:00:00Z"
    });
    expect(n).toEqual({
      title: "Trip list",
      body: "Trip list\nPassport",
      folder: "Personal",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      modifiedAt: new Date("2024-01-02T00:00:00Z")
    });
  });

  it("takes the title from the first line when the name is missing, and keeps title-only notes", () => {
    expect(normalizeNote({ body: "\n  First line\nmore" })?.title).toBe("First line");
    // A locked note arrives with the title only.
    expect(normalizeNote({ title: "Locked", body: "" })).toMatchObject({
      title: "Locked",
      body: ""
    });
    expect(normalizeNote({ title: "", body: "  " })).toBeNull();
    expect(normalizeNote("text")).toBeNull();
    expect(normalizeNote({ title: "x", folder: "" })?.folder).toBeNull();
  });

  it("turns an HTML body into text", () => {
    expect(
      htmlToText("<div><h1>Plan</h1></div><ul><li>One &amp; two</li><li>Three</li></ul>")
    ).toBe("Plan\n\n• One & two\n• Three");
    expect(normalizeNote({ title: "Plan", body: "<p>Hello<br>there</p>" })?.body).toBe(
      "Hello\nthere"
    );
  });

  it("reads one JSON value, an array, or several objects one after another", () => {
    expect(parseJsonValues('{"a":1}')).toEqual([{ a: 1 }]);
    expect(parseJsonValues('[{"a":1},{"a":2}]')).toEqual([[{ a: 1 }, { a: 2 }]]);
    expect(parseJsonValues('{"a":"}{"}\n{\n  "a": 2\n}')).toEqual([{ a: "}{" }, { a: 2 }]);
    expect(parseJsonValues("\ufeff  ")).toEqual([]);
    expect(() => parseJsonValues('{"a":1')).toThrow();
  });

  it("reads a Form with one note, or with the batch as JSON text in a notes field", async () => {
    const single = new URLSearchParams({ key: KEY, title: "A", body: "a", folder: "F" });
    const r1 = await parseNotesRequest(
      "application/x-www-form-urlencoded",
      new TextEncoder().encode(single.toString())
    );
    expect(r1.key).toBe(KEY);
    expect(r1.notes).toEqual([{ title: "A", body: "a", folder: "F" }]);

    const batch = new URLSearchParams({
      Key: KEY,
      notes: '{"title":"A","body":"a"}\n{"title":"B","body":"b"}'
    });
    const r2 = await parseNotesRequest(
      "application/x-www-form-urlencoded",
      new TextEncoder().encode(batch.toString())
    );
    expect(r2.key).toBe(KEY);
    expect(r2.notes).toHaveLength(2);
  });

  it("reads JSON as one note, a list, or {notes: [...]}", async () => {
    const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
    expect((await parseNotesRequest("application/json", enc(note({ key: KEY })))).key).toBe(KEY);
    expect((await parseNotesRequest("application/json", enc([note(), note()]))).notes).toHaveLength(
      2
    );
    const wrapped = await parseNotesRequest(
      "application/json",
      enc({ key: KEY, notes: [note(), note(), note()] })
    );
    expect(wrapped).toMatchObject({ key: KEY });
    expect(wrapped.notes).toHaveLength(3);
    // No Content-Type at all (Shortcuts' "File" body).
    expect((await parseNotesRequest("", enc({ notes: [note()] }))).notes).toHaveLength(1);
  });
});

describe("dedupe key and update rule", () => {
  const base = normalizeNote(note())!;

  it("is the creation time to the second plus the title, ignoring case and spacing", () => {
    expect(dedupeKey(base)).toBe(`c:${Date.parse("2024-03-02T18:15:30Z") / 1000}|gallery ideas`);
    expect(dedupeKey({ ...base, title: "  GALLERY   ideas " })).toBe(dedupeKey(base));
    // A folder move keeps the same note.
    expect(dedupeKey({ ...base, folder: "Archive" })).toBe(dedupeKey(base));
    expect(dedupeKey({ ...base, createdAt: new Date(base.createdAt!.getTime() + 1000) })).not.toBe(
      dedupeKey(base)
    );
    expect(dedupeKey({ ...base, createdAt: null })).toBe("t:work|gallery ideas");
  });

  it("updates a note edited since, and leaves an older or identical copy alone", () => {
    const stored = { ...base, noteModifiedAt: base.modifiedAt };
    expect(decide(undefined, base)).toBe("add");
    expect(decide(stored, base)).toBe("unchanged");
    const later = new Date(base.modifiedAt!.getTime() + 60_000);
    expect(decide(stored, { ...base, body: "new", modifiedAt: later })).toBe("update");
    const earlier = new Date(base.modifiedAt!.getTime() - 60_000);
    expect(decide(stored, { ...base, body: "older", modifiedAt: earlier })).toBe("unchanged");
    // No dates to compare: the text decides.
    const undated = { ...stored, noteModifiedAt: null };
    expect(decide(undated, { ...base, modifiedAt: null })).toBe("unchanged");
    expect(decide(undated, { ...base, body: "changed", modifiedAt: null })).toBe("update");
  });
});

describe("Apple Notes import endpoint", () => {
  it("refuses a missing or wrong key with 401 and writes nothing", async () => {
    for (const res of [
      await postJson(note()),
      await postJson({ ...note(), key: "wrong" }),
      await postJson(note(), { Authorization: "Bearer wrong" })
    ]) {
      expect(res.status).toBe(401);
      expect((await res.json()).ok).toBe(false);
    }
    expect(await allNotes()).toHaveLength(0);
  });

  it("accepts the key with the whitespace and hidden characters an iPhone paste adds", async () => {
    const res = await postJson({ ...note(), key: `\u200b ${KEY}\n\u00a0` });
    expect(res.status).toBe(200);
  });

  it("saves a single note and replies with a JSON count", async () => {
    const res = await postJson({ ...note(), key: KEY });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: true,
      received: 1,
      added: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0
    });
    const [row] = await allNotes();
    expect(row).toMatchObject({
      title: "Gallery ideas",
      folder: "Work",
      noteCreatedAt: new Date("2024-03-02T18:15:30Z"),
      noteModifiedAt: new Date("2024-03-05T17:00:00Z"),
      kind: null,
      tier: null,
      projectId: null,
      sector: null,
      personal: null,
      captureId: null
    });
  });

  it("saves a batch, and a re-run neither duplicates nor rewrites", async () => {
    const batch = Array.from({ length: 30 }, (_, i) =>
      note({ title: `Note ${i}`, body: `Note ${i}\nbody ${i}`, created: 1709403330 + i * 60 })
    );
    const first = await (await postJson({ key: KEY, notes: batch })).json();
    expect(first).toMatchObject({ ok: true, received: 30, added: 30, updated: 0 });

    const again = await (await postJson({ key: KEY, notes: batch })).json();
    expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 30 });
    expect(await allNotes()).toHaveLength(30);
  });

  it("updates a note edited since the last run", async () => {
    await postJson({ ...note(), key: KEY });
    const res = await postJson({
      ...note({ body: "Gallery ideas\nCurator said yes", modified: "2024-04-01T12:00:00Z" }),
      folder: "Done",
      key: KEY
    });
    expect(await res.json()).toMatchObject({ added: 0, updated: 1 });
    const rows = await allNotes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      body: "Gallery ideas\nCurator said yes",
      folder: "Done",
      noteModifiedAt: new Date("2024-04-01T12:00:00Z")
    });
  });

  it("saves the modified date of an unchanged note stored without one", async () => {
    await postJson({ ...note({ modified: undefined }), key: KEY });
    expect((await allNotes())[0].noteModifiedAt).toBeNull();

    const res = await postJson({ ...note(), key: KEY });
    expect(await res.json()).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    const rows = await allNotes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      body: note().body,
      noteModifiedAt: new Date("2024-03-05T09:00:00-08:00")
    });
  });

  it("does not rewrite an unchanged note that already has a modified date", async () => {
    await postJson({ ...note(), key: KEY });
    const marker = new Date("2000-01-01T00:00:00Z");
    await db.update(t.notes).set({ updatedAt: marker });

    const res = await postJson({ ...note(), key: KEY });
    expect(await res.json()).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    const [row] = await allNotes();
    expect(row.updatedAt).toEqual(marker);
    expect(row.noteModifiedAt).toEqual(new Date("2024-03-05T09:00:00-08:00"));
  });

  it("keeps the same note once when a batch carries it twice", async () => {
    const res = await postJson({ key: KEY, notes: [note(), note({ body: "later copy" })] });
    expect(await res.json()).toMatchObject({ received: 2, added: 1, unchanged: 1 });
    expect((await allNotes())[0].body).toBe("later copy");
  });

  it("takes a Form batch of Dictionaries turned into text, as the Shortcut sends it", async () => {
    const form = new FormData();
    form.set("key", KEY);
    form.set(
      "notes",
      [note({ title: "One" }), note({ title: "Two" })]
        .map((n) => JSON.stringify(n, null, 2))
        .join("\n")
    );
    const res = await post(form);
    expect(await res.json()).toMatchObject({ ok: true, added: 2 });
  });

  it("reads a multipart Form whose boundary has capital letters (curl, iOS)", async () => {
    const b = "----Boundary-AbC123xYz";
    const part = (name: string, value: string) =>
      `--${b}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const body =
      part("key", KEY) + part("title", "Mixed case") + part("body", "x") + `--${b}--\r\n`;
    const res = await post(body, { "Content-Type": `multipart/form-data; boundary=${b}` });
    expect(await res.json()).toMatchObject({ ok: true, added: 1 });
  });

  it("skips entries that are not notes and refuses an empty or oversized request", async () => {
    const res = await postJson({ key: KEY, notes: [note(), { title: "" }, 5] });
    expect(await res.json()).toMatchObject({ received: 3, added: 1, skipped: 2 });

    expect((await postJson({ key: KEY, notes: [] })).status).toBe(400);
    expect((await post("{not json", { Authorization: `Bearer ${KEY}` })).status).toBe(400);
    const big = Array.from({ length: 201 }, (_, i) => note({ title: `n${i}` }));
    expect((await postJson({ key: KEY, notes: big })).status).toBe(413);
  });

  it("logs each import in the activity log", async () => {
    await postJson({ key: KEY, notes: [note(), note({ title: "Other" })] });
    const logs = await db
      .select()
      .from(t.activityLog)
      .where(eq(t.activityLog.action, "importNotes"));
    expect(logs.at(-1)?.summary).toBe("Imported 2 notes from Apple Notes (2 new, 0 updated)");
  });
});

describe("Notes archive", () => {
  beforeEach(async () => {
    await A.importNotes.run(
      {
        notes: [
          { ...normalizeNote(note({ title: "Gallery ideas" }))! },
          {
            ...normalizeNote(
              note({ title: "Grant budget", body: "Budget 50% for travel", folder: "Grants" })
            )!,
            createdAt: new Date("2023-06-01T12:00:00Z")
          },
          {
            title: "Loose thought",
            body: "no folder here",
            folder: null,
            createdAt: null,
            modifiedAt: null
          }
        ]
      },
      { db }
    );
  });

  it("searches title and text word by word, newest first, with folder counts", async () => {
    const all = await A.searchNotes.run({}, { db });
    expect(all.notes.map((n) => n.title)).toEqual([
      "Gallery ideas",
      "Grant budget",
      "Loose thought"
    ]);
    expect(all.all).toBe(3);
    expect(all.folders).toEqual([
      { folder: null, count: 1 },
      { folder: "Grants", count: 1 },
      { folder: "Work", count: 1 }
    ]);
    expect((await A.searchNotes.run({ query: "CURATOR spring" }, { db })).notes).toHaveLength(1);
    // % is matched as itself, not as a wildcard.
    expect((await A.searchNotes.run({ query: "50%" }, { db })).notes[0].title).toBe("Grant budget");
    expect((await A.searchNotes.run({ query: "5%0" }, { db })).total).toBe(0);
  });

  it("filters by folder, no folder and creation date", async () => {
    expect((await A.searchNotes.run({ folder: "Grants" }, { db })).notes[0].title).toBe(
      "Grant budget"
    );
    expect((await A.searchNotes.run({ noFolder: true }, { db })).notes[0].title).toBe(
      "Loose thought"
    );
    const from2024 = await A.searchNotes.run({ from: new Date("2024-01-01T00:00:00Z") }, { db });
    expect(from2024.notes.map((n) => n.title)).toEqual(["Gallery ideas"]);
    const before2024 = await A.searchNotes.run({ to: new Date("2024-01-01T00:00:00Z") }, { db });
    expect(before2024.notes.map((n) => n.title)).toEqual(["Grant budget"]);
  });

  it("files a note to the Inbox once", async () => {
    const [n] = (await A.searchNotes.run({ query: "Gallery" }, { db })).notes;
    const capture = await A.fileNoteToInbox.run({ noteId: n.id }, { db });
    expect(capture.body).toBe("Gallery ideas\n\nCall the curator about the spring show");
    expect(capture.filedAt).toBeNull();
    expect((await A.getNote.run({ noteId: n.id }, { db })).filed).toBe(true);
    await expect(A.fileNoteToInbox.run({ noteId: n.id }, { db })).rejects.toThrow(
      "already in the Inbox"
    );
    // Deleting the Inbox item lets the note be filed again.
    await db.delete(t.captures).where(eq(t.captures.id, capture.id));
    await expect(A.fileNoteToInbox.run({ noteId: n.id }, { db })).resolves.toBeTruthy();
  });

  it("builds the Inbox text from the title and body without repeating the title", () => {
    expect(noteToCaptureBody({ title: "T", body: "T\nline" })).toBe("T\n\nline");
    expect(noteToCaptureBody({ title: "T", body: "T" })).toBe("T");
    expect(noteToCaptureBody({ title: "T", body: "" })).toBe("T");
    expect(noteToCaptureBody({ title: "T", body: "x".repeat(20_000) })).toHaveLength(10_000);
  });
});

describe("proxy matcher", () => {
  it("leaves /api/apple-notes public and the Notes screen behind sign-in", async () => {
    const { config } = await import("@/proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/api/apple-notes")).toBe(false);
    expect(re.test("/archive/notes")).toBe(true);
    expect(re.test("/api/apple-notes-extra")).toBe(true);
  });
});

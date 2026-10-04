// How an imported Apple Note is matched against the archive. Kept apart from lib/apple-notes.ts
// (the HTTP side) so actions/notes.ts can use it without an import cycle.

export const MAX_TITLE = 300;
export const MAX_BODY = 200_000;

export type IncomingNote = {
  title: string;
  body: string;
  folder: string | null;
  createdAt: Date | null;
  modifiedAt: Date | null;
};

type Stored = {
  title: string;
  body: string;
  folder: string | null;
  noteModifiedAt: Date | null;
};

// How a note is recognised on the next run. Shortcuts exposes no note id, so this is the
// creation time to the second plus the title, compared without case or extra spaces. A note
// without a creation date falls back to its folder and title.
export function dedupeKey(note: Pick<IncomingNote, "title" | "folder" | "createdAt">) {
  const title = note.title.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  if (note.createdAt) return `c:${Math.floor(note.createdAt.getTime() / 1000)}|${title}`;
  return `t:${(note.folder ?? "").toLowerCase()}|${title}`;
}

// What to do with a note already in the archive: update it when it was edited since the last
// import (a later modified date), or, with no dates to compare, when its text or folder differs.
export function decide(existing: Stored | undefined, incoming: IncomingNote) {
  if (!existing) return "add" as const;
  const before = existing.noteModifiedAt?.getTime();
  const after = incoming.modifiedAt?.getTime();
  if (before != null && after != null) {
    // Whole seconds: the dates a Shortcut sends carry no milliseconds.
    if (Math.floor(after / 1000) > Math.floor(before / 1000)) return "update" as const;
    if (Math.floor(after / 1000) < Math.floor(before / 1000)) return "unchanged" as const;
  }
  const same =
    existing.title === incoming.title &&
    existing.body === incoming.body &&
    (existing.folder ?? null) === incoming.folder;
  return same ? ("unchanged" as const) : ("update" as const);
}

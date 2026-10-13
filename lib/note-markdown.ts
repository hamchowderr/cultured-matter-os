// How a note's text moves between the database and the editor. A note's body is Markdown: the
// editor (Tiptap, app/(app)/archive/notes/components/note-editor.tsx) reads and writes it, and
// search, the Inbox and the assistant still see readable text. Apple Notes imports arrive as plain
// text, which is Markdown already apart from line breaks; toEditorMarkdown keeps those.

import { MAX_TITLE } from "@/lib/note-dedupe";

export const UNTITLED = "New note";

const FENCE = /^\s*(```|~~~)/;
// Lines that start a Markdown block of their own (heading, list item, quote, table row, rule).
const BLOCK_START = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||(-{3,}|\*{3,}|_{3,})\s*$)/;

// In Markdown a single line break inside a paragraph is a space; in Apple Notes it is a new line.
// Each line that runs straight on into another plain line gets a hard break, so the editor shows
// the note the way it was written. Code blocks and lines that start their own block are left alone.
export function toEditorMarkdown(body: string) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  return lines
    .map((line, i) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      const next = lines[i + 1];
      if (inFence || next === undefined || !line.trim() || !next.trim()) return line;
      if (BLOCK_START.test(line) || BLOCK_START.test(next) || FENCE.test(next)) return line;
      if (/(\s{2}|\\)$/.test(line)) return line;
      return `${line}\\`;
    })
    .join("\n");
}

// A line as plain words: Markdown marks, links and escapes removed.
export function plainLine(line: string) {
  return line
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\W)[*_](\S[^*_]*)[*_](?=\W|$)/g, "$1$2")
    .replace(/\\(.)/g, "$1")
    .replace(/\\$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Like Apple Notes, a note's title is its first line.
export function titleFromMarkdown(body: string) {
  for (const line of body.split("\n")) {
    const words = plainLine(line);
    if (words) return words.slice(0, MAX_TITLE);
  }
  return UNTITLED;
}

// The few words under a title in the note list: the text after the title line, without marks.
export function previewFromMarkdown(title: string, body: string) {
  const lines = body
    .split("\n")
    .map(plainLine)
    .filter((l) => l && !/^(-{3,}|\*{3,}|_{3,}|`{3,}|~{3,})$/.test(l));
  if (lines[0] === title.trim()) lines.shift();
  return lines.join(" ");
}

// What the editor opens with. The title is its own first line (the editor shows it large), then
// the rest of the text. A body that is empty (a locked note imports as its title only) or does not
// start with the title gets the title added on top.
export function editorStart(title: string, body: string) {
  const text = body.trim();
  if (!text) return title === UNTITLED ? "" : title;
  if (titleFromMarkdown(text) !== title.trim()) return `${title}\n\n${toEditorMarkdown(text)}`;
  const [first, ...rest] = text.split("\n");
  const after = rest.join("\n").trim();
  return after ? `${first.replace(/(\s{2}|\\)$/, "")}\n\n${toEditorMarkdown(after)}` : first;
}

"use client";

// The open note: a Tiptap editor that saves as she types, like Apple Notes. The first line is
// the title. The text is kept as Markdown (lib/note-markdown.ts), so search, the Inbox and the
// assistant still read it as plain words.

import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  BoldIcon,
  HeadingIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon
} from "lucide-react";
import { useEffect, useRef } from "react";

import { updateNote } from "@/actions/server";
import { Toggle } from "@/components/ui/toggle";
import { editorStart } from "@/lib/note-markdown";
import { cn } from "@/lib/utils";
import "./note-editor.css";

export type SaveState = "saved" | "saving" | "error";

// How long a pause in typing is before the note saves.
const SAVE_AFTER_MS = 800;

export function NoteEditor({
  noteId,
  title,
  body,
  onSaveState
}: {
  noteId: string;
  title: string;
  body: string;
  onSaveState: (state: SaveState) => void;
}) {
  const saved = useRef(body);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);

  // One save at a time, always of the latest text.
  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (running.current || pending.current == null) return;
    const text = pending.current;
    pending.current = null;
    if (text === saved.current) {
      onSaveState("saved");
      return;
    }
    onSaveState("saving");
    running.current = updateNote({ noteId, body: text })
      .then((r) => {
        if (r.ok) saved.current = text;
        else pending.current ??= text;
        onSaveState(r.ok ? (pending.current == null ? "saved" : "saving") : "error");
      })
      .catch(() => {
        pending.current ??= text;
        onSaveState("error");
      })
      .finally(() => {
        running.current = null;
        if (pending.current != null && pending.current !== text) flush();
      });
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Markdown has no underline; keep to what the text can hold.
        underline: false,
        link: { openOnClick: false, autolink: true }
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start with a title, then write…" }),
      Markdown
    ],
    content: editorStart(title, body),
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "note-editor min-h-full px-5 py-4 outline-none sm:px-8 sm:py-6",
        "aria-label": "Note text"
      }
    },
    onUpdate: ({ editor }) => {
      pending.current = editor.getMarkdown();
      onSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_AFTER_MS);
    },
    onBlur: () => flush()
  });

  // Save what's left when the note closes, and warn before leaving with unsaved text.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current != null || running.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

const TOOLS = [
  {
    label: "Heading",
    icon: HeadingIcon,
    active: (e: Editor) => e.isActive("heading", { level: 2 }),
    run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    label: "Bold",
    icon: BoldIcon,
    active: (e: Editor) => e.isActive("bold"),
    run: (e: Editor) => e.chain().focus().toggleBold().run()
  },
  {
    label: "Italic",
    icon: ItalicIcon,
    active: (e: Editor) => e.isActive("italic"),
    run: (e: Editor) => e.chain().focus().toggleItalic().run()
  },
  {
    label: "Strikethrough",
    icon: StrikethroughIcon,
    active: (e: Editor) => e.isActive("strike"),
    run: (e: Editor) => e.chain().focus().toggleStrike().run()
  },
  {
    label: "Bulleted list",
    icon: ListIcon,
    active: (e: Editor) => e.isActive("bulletList"),
    run: (e: Editor) => e.chain().focus().toggleBulletList().run()
  },
  {
    label: "Numbered list",
    icon: ListOrderedIcon,
    active: (e: Editor) => e.isActive("orderedList"),
    run: (e: Editor) => e.chain().focus().toggleOrderedList().run()
  },
  {
    label: "Checklist",
    icon: ListChecksIcon,
    active: (e: Editor) => e.isActive("taskList"),
    run: (e: Editor) => e.chain().focus().toggleTaskList().run()
  },
  {
    label: "Quote",
    icon: QuoteIcon,
    active: (e: Editor) => e.isActive("blockquote"),
    run: (e: Editor) => e.chain().focus().toggleBlockquote().run()
  }
];

function Toolbar({ editor }: { editor: Editor | null }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? TOOLS.map((t) => t.active(editor)) : [])
  });
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-3 py-1.5 sm:px-6"
    >
      {TOOLS.map((t, i) => (
        <Toggle
          key={t.label}
          size="sm"
          aria-label={t.label}
          title={t.label}
          disabled={!editor}
          pressed={!!active?.[i]}
          onPressedChange={() => editor && t.run(editor)}
          // Keep the text selected while a button is clicked.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(i === 4 && "ms-2")}
        >
          <t.icon />
        </Toggle>
      ))}
    </div>
  );
}

"use client";

// The right side of the Notes page: the open note, ready to edit, with where it came from, whether
// it has saved, and "File to Inbox" to sort it the usual way. On a phone it fills the screen and
// "Notes" goes back to the list.

import { ChevronLeftIcon, FolderIcon, InboxIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteNote, fileNoteToInbox } from "@/actions/server";
import { ListLink, useListNavigation } from "@/components/layout/list-transition";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoteEditor, type SaveState } from "./note-editor";

export type OpenNote = {
  id: string;
  title: string;
  body: string;
  folder: string | null;
  created: string | null;
  modified: string | null;
  fromApple: boolean;
  filed: boolean;
};

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Couldn’t save. Keep this open and try again."
};

export function NotePane({ note, closeHref }: { note: OpenNote; closeHref: string }) {
  const router = useRouter();
  const { navigate } = useListNavigation();
  const [save, setSave] = useState<SaveState>("saved");
  const [filing, startFiling] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [filed, setFiled] = useState(note.filed);

  function fileToInbox() {
    startFiling(async () => {
      const result = await fileNoteToInbox({ noteId: note.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setFiled(true);
      toast.success("Filed to the Inbox, under To sort.", {
        action: { label: "Open Inbox", onClick: () => router.push("/inbox") }
      });
    });
  }

  function remove() {
    startDeleting(async () => {
      const result = await deleteNote({ noteId: note.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Note deleted.");
      navigate(closeHref, { replace: true });
    });
  }

  const dates = [
    note.created && `Created ${note.created}`,
    note.modified && note.modified !== note.created && `Edited ${note.modified}`
  ].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 sm:px-6">
        <Button variant="ghost" size="sm" className="-ms-2 lg:hidden" asChild>
          <ListLink href={closeHref}>
            <ChevronLeftIcon />
            Notes
          </ListLink>
        </Button>
        {/* On a phone the details drop to their own line under the buttons. */}
        <div className="text-muted-foreground order-last flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs lg:order-none lg:w-auto lg:flex-1">
          {note.folder && (
            <Badge variant="outline" className="max-w-48 gap-1 truncate">
              <FolderIcon className="size-3" />
              {note.folder}
            </Badge>
          )}
          {dates.length > 0 && <span>{dates.join(" · ")}</span>}
          {note.fromApple && <span>· From Apple Notes</span>}
          <span role="status" className={save === "error" ? "text-destructive" : undefined}>
            {SAVE_LABEL[save]}
          </span>
        </div>
        <div className="ms-auto flex items-center gap-1">
          {filed ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/inbox">
                <InboxIcon />
                In the Inbox
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={fileToInbox} disabled={filing}>
              <InboxIcon />
              {filing ? "Filing…" : "File to Inbox"}
            </Button>
          )}
          {!note.fromApple && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Delete note" disabled={deleting}>
                  <Trash2Icon />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{note.title}” will be gone for good.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <NoteEditor
        key={note.id}
        noteId={note.id}
        title={note.title}
        body={note.body}
        onSaveState={setSave}
      />
    </div>
  );
}

"use client";

// One note, opened from the Notes archive, with "File to Inbox" to sort it the usual way.

import { FolderIcon, InboxIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { fileNoteToInbox } from "@/actions/server";
import { useListNavigation } from "@/components/layout/list-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export type OpenNote = {
  id: string;
  title: string;
  body: string;
  folder: string | null;
  created: string | null;
  modified: string | null;
  filed: boolean;
};

export function NoteDialog({ note, closeHref }: { note: OpenNote | null; closeHref: string }) {
  const router = useRouter();
  const { navigate } = useListNavigation();
  const [open, setOpen] = useState(true);
  const [filing, startFiling] = useTransition();
  const [filed, setFiled] = useState(note?.filed ?? false);

  function close() {
    setOpen(false);
    navigate(closeHref, { replace: true });
  }

  function fileToInbox() {
    if (!note) return;
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
      router.refresh();
    });
  }

  const dates = [
    note?.created && `Created ${note.created}`,
    note?.modified && note.modified !== note.created && `Edited ${note.modified}`
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-2xl">
        {!note ? (
          <DialogHeader>
            <DialogTitle>Note not found</DialogTitle>
            <DialogDescription>
              It may have been removed. Close this and pick another.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader className="pe-6">
              <DialogTitle className="font-display text-xl leading-snug break-words">
                {note.title}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                {note.folder && (
                  <Badge variant="outline" className="gap-1">
                    <FolderIcon className="size-3" />
                    {note.folder}
                  </Badge>
                )}
                {dates.length > 0 && <span>{dates.join(" · ")}</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-6 -mb-4 min-h-0 flex-1 overflow-y-auto border-t px-6 py-4">
              {note.body.trim() ? (
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {note.body}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No text came through. A locked note imports as its title only.
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              {filed ? (
                <Button variant="outline" asChild>
                  <Link href="/inbox">
                    <InboxIcon />
                    In the Inbox
                  </Link>
                </Button>
              ) : (
                <Button onClick={fileToInbox} disabled={filing}>
                  <InboxIcon />
                  {filing ? "Filing…" : "File to Inbox"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

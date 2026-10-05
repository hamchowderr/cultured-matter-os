"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { draftFollowUp, searchContacts } from "@/actions/server";
import type { Contact } from "@/actions/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Recipient = Pick<Contact, "id" | "fullName" | "email">;

// Writes a follow-up. Nothing reaches Gmail until it is approved; approving saves it in her
// Gmail Drafts and she sends it herself.
export function FollowUpDialog({
  open,
  onOpenChange,
  contact,
  taskId,
  defaultSubject = ""
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Without a contact, the dialog asks who it is for.
  contact?: Recipient;
  taskId?: string;
  defaultSubject?: string;
}) {
  const [to, setTo] = useState<Recipient | undefined>(contact);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(contact);
    setQuery("");
    setSubject(defaultSubject);
    setBody("");
  }, [open]);

  useEffect(() => {
    if (to || !query.trim()) return setMatches([]);
    const t = setTimeout(async () => {
      const result = await searchContacts({ query: query.trim(), limit: 8 });
      if (result.ok) setMatches(result.data.contacts.filter((c) => c.email));
    }, 250);
    return () => clearTimeout(t);
  }, [query, to]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    setSaving(true);
    const result = await draftFollowUp({ contactId: to.id, taskId, subject, body });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Sent for approval. Once you approve it, it waits in your Gmail Drafts.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Draft follow-up</DialogTitle>
            <DialogDescription>
              After you approve it, this is saved in your Gmail Drafts. You send it yourself.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="follow-up-to">To</Label>
            {to ? (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                <span className="truncate">
                  {to.fullName} <span className="text-muted-foreground">· {to.email}</span>
                </span>
                {!contact && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setTo(undefined)}>
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  id="follow-up-to"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people with an email address"
                  autoComplete="off"
                />
                {matches.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="hover:bg-muted w-full px-3 py-1.5 text-left"
                          onClick={() => setTo(m)}
                        >
                          {m.fullName} <span className="text-muted-foreground">· {m.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="follow-up-subject">Subject</Label>
            <Input
              id="follow-up-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow-up-body">Message</Label>
            <Textarea
              id="follow-up-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !to || !subject.trim() || !body.trim()}>
              {saving ? "Saving…" : "Send for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

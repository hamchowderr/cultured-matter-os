"use client";

import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ExternalLinkIcon,
  MailIcon,
  RefreshCwIcon
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { listContactEmails, syncOutlook } from "@/actions/server";
import type { Contact } from "@/actions/schemas";
import type { ContactEmail } from "@/actions/outlook";
import { ConnectOutlookButton, connectOutlook } from "@/components/outlook/connect-outlook-button";
import { FollowUpDialog } from "@/components/outlook/follow-up-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

// "Sync Outlook" once connected, "Connect Outlook" until Microsoft grants mail and contacts.
export function OutlookSync({ connected, onSynced }: { connected: boolean; onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Back from Microsoft after Connect Outlook.
  useEffect(() => {
    const outcome = params.get("outlook");
    if (!outcome) return;
    if (outcome === "connected") toast.success("Outlook is connected. Press Sync Outlook.");
    else toast.error("Outlook wasn't connected. Please try again.");
    const next = new URLSearchParams(params.toString());
    next.delete("outlook");
    next.delete("error");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [params]);

  if (!connected) return <ConnectOutlookButton />;

  async function sync() {
    setSyncing(true);
    const result = await syncOutlook({});
    setSyncing(false);
    if (!result.ok) {
      if (result.error.code === "outlook_not_connected") {
        return toast.error(result.error.message, {
          action: { label: "Connect Outlook", onClick: () => connectOutlook() }
        });
      }
      return toast.error(result.error.message);
    }
    const { created, emailsLogged } = result.data;
    toast.success(
      `Added ${created} ${created === 1 ? "person" : "people"} from Outlook and logged ${emailsLogged} ${
        emailsLogged === 1 ? "email" : "emails"
      }`
    );
    onSynced();
  }

  return (
    <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
      {syncing ? <Spinner /> : <RefreshCwIcon />}
      {syncing ? "Syncing…" : "Sync Outlook"}
    </Button>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

// A contact's recent Outlook emails, and a way to write a follow-up.
export function ContactOutlookButton({ contact }: { contact: Contact }) {
  const [open, setOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [emails, setEmails] = useState<ContactEmail[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmails(null);
    listContactEmails({ contactId: contact.id }).then((result) => {
      if (result.ok) setEmails(result.data.emails);
      else {
        setEmails([]);
        toast.error(result.error.message);
      }
    });
  }, [open, contact.id]);

  if (!contact.email) return null;

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={`Emails with ${contact.fullName}`}
        onClick={() => setOpen(true)}
      >
        <MailIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Emails with {contact.fullName}</DialogTitle>
            <DialogDescription>
              Recent emails from Outlook. Open one to read it there.
            </DialogDescription>
          </DialogHeader>
          {emails === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : emails.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              No emails logged yet. Sync Outlook to bring in recent ones.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {emails.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  {e.direction === "in" ? (
                    <ArrowDownLeftIcon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-label="Received"
                    />
                  ) : (
                    <ArrowUpRightIcon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-label="Sent"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{e.subject || "(no subject)"}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {dateFormat.format(e.at)}
                  </span>
                  {e.webLink && (
                    <a
                      href={e.webLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Open in Outlook"
                    >
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false);
                setDrafting(true);
              }}
            >
              Draft follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FollowUpDialog open={drafting} onOpenChange={setDrafting} contact={contact} />
    </>
  );
}

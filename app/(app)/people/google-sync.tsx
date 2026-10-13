"use client";

import { ArrowDownLeftIcon, ArrowUpRightIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { listContactEmails, syncGoogle } from "@/actions/server";
import type { ContactEmail } from "@/actions/gmail";
import { ConnectGoogleButton, connectGoogle } from "@/components/google/connect-google-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runGmailSync } from "@/lib/gmail-sync-run";

// "Sync Gmail" once connected, "Sync Google" until Google grants Gmail and Contacts.
export function GoogleSync({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ read: number; total: number } | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Back from Google after Sync Google.
  useEffect(() => {
    const outcome = params.get("google");
    if (!outcome) return;
    if (outcome === "connected") toast.success("Google is connected. Press Sync Gmail.");
    else toast.error("Google wasn't connected. Please try again.");
    const next = new URLSearchParams(params.toString());
    next.delete("google");
    next.delete("error");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [params]);

  if (!connected) return <ConnectGoogleButton />;

  async function sync() {
    setSyncing(true);
    setProgress(null);
    const run = await runGmailSync(() => syncGoogle({}), {
      // Each batch is saved as it goes; the action refreshes the page, so people appear too.
      onProgress: (read, total) => setProgress({ read, total }),
      onSlowedDown: () =>
        toast.info("Gmail asked us to slow down. Continuing in a moment…", { id: "gmail-slow" })
    });
    setSyncing(false);
    setProgress(null);
    const added = `Added ${run.created} ${run.created === 1 ? "person" : "people"} from Google and logged ${run.emailsLogged} ${
      run.emailsLogged === 1 ? "email" : "emails"
    }`;
    if (run.ok) return toast.success(added);
    if (run.error.code === "google_not_connected") {
      return toast.error(run.error.message, {
        action: { label: "Sync Google", onClick: () => connectGoogle() }
      });
    }
    // Whatever was read before it stopped is saved; the next Sync Gmail continues from there.
    toast.error(
      run.created || run.emailsLogged ? `${run.error.message} ${added} so far.` : run.error.message
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={sync} disabled={syncing} aria-live="polite">
      {syncing ? <Spinner /> : <RefreshCwIcon />}
      {syncing
        ? progress && progress.total
          ? `Syncing ${progress.read} of ${progress.total}…`
          : "Syncing…"
        : "Sync Gmail"}
    </Button>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

// A contact's recent Gmail emails, newest first. Each opens in Gmail.
export function ContactEmails({ contactId }: { contactId: string }) {
  const [emails, setEmails] = useState<ContactEmail[] | null>(null);

  useEffect(() => {
    let live = true;
    setEmails(null);
    listContactEmails({ contactId }).then((result) => {
      if (!live) return;
      if (result.ok) setEmails(result.data.emails);
      else {
        setEmails([]);
        toast.error(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, [contactId]);

  if (emails === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (emails.length === 0) {
    return (
      <p className="text-muted-foreground py-2 text-sm">
        No emails yet. Sync Gmail to bring in recent ones.
      </p>
    );
  }
  return (
    <ul className="divide-y text-sm">
      {emails.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2">
          {e.direction === "in" ? (
            <ArrowDownLeftIcon
              className="text-muted-foreground size-4 shrink-0"
              aria-label="Received"
            />
          ) : (
            <ArrowUpRightIcon className="text-muted-foreground size-4 shrink-0" aria-label="Sent" />
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
              aria-label="Open in Gmail"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

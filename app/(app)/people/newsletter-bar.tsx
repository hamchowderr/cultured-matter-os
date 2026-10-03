"use client";

import { MailIcon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { syncNewsletter } from "@/actions/server";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NewsletterStatus = {
  connected: boolean;
  subscribed: number;
  waiting: number;
  lastSyncedAt: Date | null;
};

export function NewsletterBar({
  status,
  showingOnly,
  onToggleOnly
}: {
  status: NewsletterStatus;
  showingOnly: boolean;
  onToggleOnly: () => void;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [, startTransition] = useTransition();

  async function sync() {
    setSyncing(true);
    const result = await syncNewsletter();
    setSyncing(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const r = result.data;
    if (!r.connected) {
      toast.info("The newsletter isn't connected to FluentCRM yet.");
      return;
    }
    const parts = [`${r.added} added`, `${r.removed} removed`];
    if (r.blocked) parts.push(`${r.blocked} had unsubscribed and were taken off`);
    if (r.failed) {
      toast.error(
        `Newsletter sync: ${parts.join(", ")}, ${r.failed} didn't go through. ${r.error ?? ""}`
      );
    } else if (r.added + r.removed + r.blocked === 0) {
      toast.success("The newsletter list is already up to date");
    } else {
      toast.success(`Newsletter synced: ${parts.join(", ")}`);
    }
    startTransition(() => router.refresh());
  }

  const people = `${status.subscribed.toLocaleString()} ${status.subscribed === 1 ? "person" : "people"}`;

  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <MailIcon className="text-muted-foreground size-4" />
      <button
        type="button"
        onClick={onToggleOnly}
        className={cn("font-medium hover:underline", showingOnly && "text-primary")}
        aria-pressed={showingOnly}
      >
        Newsletter: {people}
      </button>
      {status.connected ? (
        <>
          <span className="text-muted-foreground">
            {status.waiting > 0
              ? `${status.waiting} ${status.waiting === 1 ? "change" : "changes"} waiting to sync`
              : status.lastSyncedAt
                ? `Last synced ${formatDate(status.lastSyncedAt)}`
                : "Not synced yet"}
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={sync} disabled={syncing}>
            <RefreshCwIcon className={cn(syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync newsletter"}
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground ml-auto">
          The newsletter isn’t connected to FluentCRM yet. You can still mark people; they’ll be
          sent over once it’s connected.
        </span>
      )}
    </div>
  );
}

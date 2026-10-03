"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { Approval } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ApprovalCardProps = {
  approval: Approval;
  onApprove?: () => void;
  // Called with the optional note typed after pressing Reject.
  onReject?: (note?: string) => void;
  // Disables the buttons while a decision is being saved.
  busy?: boolean;
  className?: string;
};

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  busy,
  className
}: ApprovalCardProps) {
  const pending = approval.status === "pending";
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  return (
    <article className={cn("bg-card flex flex-col gap-3 rounded-lg border p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs">Needs your approval</p>
          <h3 className="font-medium">{approval.summary}</h3>
        </div>
        {!pending && (
          <Badge variant={approval.status === "approved" ? "success" : "secondary"}>
            {approval.status === "approved" ? "Approved" : "Rejected"}
          </Badge>
        )}
      </header>
      {pending && rejecting && onReject && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onReject(note.trim() || undefined);
          }}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Why not? (optional)"
            aria-label="Reason for rejecting (optional)"
            className="min-h-12"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={busy}>
              <XIcon />
              Reject
            </Button>
          </div>
        </form>
      )}
      <footer className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>
          Requested {formatDate(approval.createdAt)}
          {approval.decidedAt && ` · decided ${formatDate(approval.decidedAt)}`}
        </span>
        {pending && !rejecting && (onApprove || onReject) && (
          <span className="ml-auto flex gap-1">
            {onReject && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejecting(true)}>
                <XIcon />
                Reject
              </Button>
            )}
            {onApprove && (
              <Button size="sm" disabled={busy} onClick={onApprove}>
                <CheckIcon />
                Approve
              </Button>
            )}
          </span>
        )}
      </footer>
    </article>
  );
}

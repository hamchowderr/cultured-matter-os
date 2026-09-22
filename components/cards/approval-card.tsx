"use client";

import { CheckIcon, XIcon } from "lucide-react";

import type { Approval } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ApprovalCardProps = {
  approval: Approval;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
};

export function ApprovalCard({ approval, onApprove, onReject, className }: ApprovalCardProps) {
  const pending = approval.status === "pending";

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
      <footer className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>
          Requested {formatDate(approval.createdAt)}
          {approval.decidedAt && ` · decided ${formatDate(approval.decidedAt)}`}
        </span>
        {pending && (onApprove || onReject) && (
          <span className="ml-auto flex gap-1">
            {onReject && (
              <Button size="sm" variant="ghost" onClick={onReject}>
                <XIcon />
                Reject
              </Button>
            )}
            {onApprove && (
              <Button size="sm" onClick={onApprove}>
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

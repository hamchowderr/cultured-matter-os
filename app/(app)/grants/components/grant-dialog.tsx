"use client";

import type { Grant } from "@/actions/schemas";
import { GrantCard } from "@/components/cards";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

type Status = NonNullable<Grant["status"]>;

/** One grant, opened from a board card or a calendar deadline. */
export function GrantDialog({
  grant,
  onOpenChange,
  onStatusChange
}: {
  grant: Grant | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (grant: Grant, status: Status) => void;
}) {
  return (
    <Dialog open={grant != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant</DialogTitle>
          <DialogDescription className="sr-only">
            Deadline, amount and eligibility for this grant.
          </DialogDescription>
        </DialogHeader>
        {grant && (
          <div className="space-y-4">
            <GrantCard
              grant={grant}
              onStatusChange={(status) => onStatusChange(grant, status)}
              className="border-0 p-0"
            />
            {grant.description && (
              <p className="text-muted-foreground max-h-64 overflow-y-auto text-sm whitespace-pre-line">
                {grant.description}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

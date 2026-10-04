"use client";

import { ExternalLinkIcon } from "lucide-react";

import type { Grant } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { daysUntil, formatAmount, formatDeadline } from "@/lib/format";
import { cn } from "@/lib/utils";

type GrantStatus = NonNullable<Grant["status"]>;

const statuses: { value: GrantStatus; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "applying", label: "Applying" },
  { value: "submitted", label: "Submitted" },
  { value: "passed", label: "Passed" }
];

export type GrantCardProps = {
  grant: Grant;
  onStatusChange?: (status: GrantStatus) => void;
  now?: Date;
  className?: string;
};

export function GrantCard({ grant, onStatusChange, now = new Date(), className }: GrantCardProps) {
  const amount = formatAmount(grant.amountMin, grant.amountMax);
  const days = grant.deadline ? daysUntil(grant.deadline, now) : null;
  const urgent = days != null && days >= 0 && days <= 14;

  return (
    <article className={cn("bg-muted/40 flex flex-col gap-3 rounded-lg p-4", className)}>
      <header className="space-y-1">
        <h3 className="leading-snug font-semibold">
          {grant.url ? (
            <a href={grant.url} target="_blank" rel="noreferrer" className="hover:underline">
              {grant.title}
              <ExternalLinkIcon className="text-muted-foreground ml-1 inline size-3" />
            </a>
          ) : (
            grant.title
          )}
        </h3>
        {grant.agency && <p className="text-muted-foreground text-sm">{grant.agency}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={urgent ? "warning" : "outline"}>
          {formatDeadline(grant.deadline, now)}
        </Badge>
        {amount && <Badge variant="outline">{amount}</Badge>}
        {grant.forProfitEligible ? (
          <Badge variant="success">For-profit eligible</Badge>
        ) : (
          <Badge variant="secondary">Nonprofit only</Badge>
        )}
      </div>

      {onStatusChange ? (
        <Select
          value={grant.status ?? undefined}
          onValueChange={(v) => onStatusChange(v as GrantStatus)}
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Board status">
            <SelectValue placeholder="Add to board" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        grant.status && (
          <p className="text-muted-foreground text-xs">
            {statuses.find((s) => s.value === grant.status)?.label}
          </p>
        )
      )}
    </article>
  );
}

"use client";

import * as React from "react";
import {
  BuildingIcon,
  CalendarDaysIcon,
  CoinsIcon,
  ExternalLinkIcon,
  SparklesIcon
} from "lucide-react";
import Link from "next/link";

import type { Grant } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { daysUntil, formatAmount, formatDeadline } from "@/lib/format";

type Status = NonNullable<Grant["status"]>;

export const GRANT_STATUSES: { value: Status; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "applying", label: "Applying" },
  { value: "submitted", label: "Submitted" },
  { value: "passed", label: "Passed" }
];

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground w-24 shrink-0 text-sm">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end text-end">{children}</div>
    </div>
  );
}

/** One grant, opened from a board card, a list or table row, or a calendar deadline. */
export function GrantDrawer({
  grant,
  onOpenChange,
  onStatusChange
}: {
  grant: Grant | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (grant: Grant, status: Status) => void;
}) {
  const amount = grant ? formatAmount(grant.amountMin, grant.amountMax) : null;
  const days = grant?.deadline ? daysUntil(grant.deadline) : null;
  const urgent = days != null && days >= 0 && days <= 14;

  return (
    <Drawer direction="right" open={grant != null} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-lg">
        <DrawerHeader className="pb-0">
          <DrawerTitle>Grant</DrawerTitle>
          <DrawerDescription className="sr-only">
            Deadline, amount and eligibility for this grant.
          </DrawerDescription>
        </DrawerHeader>
        {grant && (
          <div className="space-y-6 overflow-y-auto p-4">
            <div className="space-y-2">
              <h2 className="text-lg leading-snug font-semibold">{grant.title}</h2>
              {grant.agency && (
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <BuildingIcon className="size-3.5 shrink-0" />
                  {grant.agency}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <MetaRow label="Board">
                <Select
                  value={grant.status ?? undefined}
                  onValueChange={(v) => onStatusChange(grant, v as Status)}
                >
                  <SelectTrigger size="sm" className="w-fit" aria-label="Board status">
                    <SelectValue placeholder="Add to board" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MetaRow>
              <MetaRow label="Deadline">
                <Badge variant={urgent ? "warning" : "outline"}>
                  <CalendarDaysIcon />
                  {formatDeadline(grant.deadline)}
                </Badge>
              </MetaRow>
              {amount && (
                <MetaRow label="Amount">
                  <span className="flex items-center gap-1.5 text-sm">
                    <CoinsIcon className="text-muted-foreground size-3.5" />
                    {amount}
                  </span>
                </MetaRow>
              )}
              <MetaRow label="Eligibility">
                {grant.forProfitEligible ? (
                  <Badge variant="success">For-profit eligible</Badge>
                ) : (
                  <Badge variant="secondary">Nonprofit only</Badge>
                )}
              </MetaRow>
            </div>

            <Button className="h-11 w-full md:h-9" asChild>
              <Link href={`/grants/${grant.id}`}>
                <SparklesIcon />
                Draft application
              </Link>
            </Button>

            {grant.url && (
              <Button variant="outline" className="h-11 w-full md:h-9" asChild>
                <a href={grant.url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Open the listing
                </a>
              </Button>
            )}

            {grant.description && (
              <div className="space-y-2">
                <span className="font-semibold">About this grant</span>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {grant.description}
                </p>
              </div>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { BusinessMap, BusinessMapNode } from "@/lib/business-map";
import { RECORD_LABELS } from "@/lib/mind-map";
import { cn } from "@/lib/utils";
import { KIND_ICONS } from "./map-nodes";

// Which screen an href opens, for the button label.
export function pageName(href: string) {
  const path = href.split("?")[0];
  const names: Record<string, string> = {
    "/projects": "Projects",
    "/people": "People",
    "/radar": "Radar",
    "/grants": "Grants",
    "/inbox": "Inbox",
    "/settings/business": "Settings"
  };
  return names[path] ?? "the app";
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

const plain = (s: string) => s.replace(/_/g, " ");

function kindLabel(n: BusinessMapNode) {
  if (n.record) return RECORD_LABELS[n.record.type];
  if (n.kind === "business") return "Business";
  if (n.kind === "more") return "More";
  return "Group";
}

// What a tapped node on the business map shows: the record's own fields, then a button to the
// screen where it lives (Projects opens the task itself; Radar opens the company's panel).
export function RecordSheet({
  node,
  counts,
  onClose
}: {
  node: BusinessMapNode | null;
  counts: BusinessMap["counts"];
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const Icon = node ? KIND_ICONS[node.kind] : null;
  const rows: [string, string][] = [];
  if (node) {
    if (node.status) rows.push(["Status", plain(node.status)]);
    if (node.priority) rows.push(["Priority", node.priority]);
    if (node.due)
      rows.push([node.kind === "grant" ? "Deadline" : "Due", dateFormat.format(node.due)]);
    if (node.kind === "grant" && !node.due) rows.push(["Deadline", "Rolling"]);
    if (node.detail && node.kind !== "more") {
      const label =
        node.kind === "company"
          ? "Stage"
          : node.kind === "person"
            ? "Role"
            : node.kind === "grant"
              ? "Agency"
              : "About";
      rows.push([label, node.detail]);
    }
    if (node.kind === "business") {
      rows.push(
        ["Open projects", String(counts.projects)],
        ["Open tasks", String(counts.tasks)],
        ["Ideas", String(counts.ideas)],
        ["Radar companies", String(counts.companies)],
        ["People who can reach them", String(counts.people)],
        ["Grants in play", String(counts.grants)]
      );
    }
  }

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("outline-none", isMobile ? "max-h-[80dvh] overflow-y-auto" : "sm:max-w-md")}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
      >
        {node && Icon && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Icon className="size-3" />
                  {kindLabel(node)}
                </Badge>
              </div>
              <SheetTitle className="text-lg leading-snug">
                {node.kind === "more" ? `${node.label} ${node.detail ?? ""}`.trim() : node.label}
              </SheetTitle>
              <SheetDescription>
                {node.kind === "more"
                  ? "The map shows the first few. See them all on their page."
                  : node.kind === "hub"
                    ? `Everything here lives in ${pageName(node.href ?? "")}.`
                    : node.kind === "business"
                      ? "Everything on the map, counted in full."
                      : `Live from ${pageName(node.href ?? "")}.`}
              </SheetDescription>
            </SheetHeader>
            {rows.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words first-letter:uppercase">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {node.href && (
              <SheetFooter>
                <Button asChild className="touch:h-11">
                  <Link href={node.href}>
                    {node.kind === "business"
                      ? "Open the business profile"
                      : `Open in ${pageName(node.href)}`}
                    <ArrowUpRightIcon />
                  </Link>
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

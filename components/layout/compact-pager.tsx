"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ListLink } from "@/components/layout/list-transition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A link (paged on the server through the list transition), a click handler (paged in the
// browser), or null when there is no page that way.
type Step = string | (() => void) | null;

/**
 * "1–24 of 1,716" with previous and next buttons, for the top of a paged list. The bottom pager
 * stays; this saves scrolling to the end of a long page. On a phone only the buttons show.
 */
export function CompactPager({
  from,
  to,
  total,
  prev,
  next,
  className
}: {
  from: number;
  to: number;
  total: number;
  prev: Step;
  next: Step;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-muted-foreground text-sm whitespace-nowrap tabular-nums max-sm:sr-only">
        {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")}
      </span>
      <nav className="flex items-center gap-1" aria-label="Pages">
        <StepButton step={prev} label="Previous page">
          <ChevronLeftIcon />
        </StepButton>
        <StepButton step={next} label="Next page">
          <ChevronRightIcon />
        </StepButton>
      </nav>
    </div>
  );
}

function StepButton({ step, label, children }: { step: Step; label: string; children: ReactNode }) {
  const inner = (
    <>
      <span className="sr-only">{label}</span>
      {children}
    </>
  );
  if (typeof step === "string") {
    return (
      <Button variant="outline" size="icon-sm" asChild>
        <ListLink href={step}>{inner}</ListLink>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon-sm" disabled={!step} onClick={step ?? undefined}>
      {inner}
    </Button>
  );
}

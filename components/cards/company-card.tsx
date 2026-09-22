"use client";

import { ExternalLinkIcon, StarIcon, UsersIcon, XIcon } from "lucide-react";

import type { Company } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusLabel: Record<Company["status"], string | null> = {
  new: null,
  starred: "Starred",
  shortlisted: "Shortlisted",
  passed: "Passed"
};

export type CompanyCardProps = {
  company: Company;
  sources?: string[];
  warmPathCount?: number;
  onShortlist?: () => void;
  onPass?: () => void;
  onOpen?: () => void;
  className?: string;
};

export function CompanyCard({
  company,
  sources = [],
  warmPathCount,
  onShortlist,
  onPass,
  onOpen,
  className
}: CompanyCardProps) {
  const status = statusLabel[company.status];

  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-3 rounded-lg border p-4",
        company.status === "passed" && "opacity-60",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            {onOpen ? (
              <button type="button" onClick={onOpen} className="hover:underline">
                {company.name}
              </button>
            ) : (
              company.name
            )}
          </h3>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
            >
              {company.domain ?? company.website}
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
        {status && <Badge variant="secondary">{status}</Badge>}
      </header>

      {company.description && (
        <p className="text-muted-foreground line-clamp-2 text-sm">{company.description}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {company.categories.map((c) => (
          <Badge key={c} variant="outline">
            {c}
          </Badge>
        ))}
        {company.stage && <Badge variant="outline">{company.stage}</Badge>}
      </div>

      <footer className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {sources.length > 0 && <span>From {sources.join(", ")}</span>}
        {company.cohortYear && <span>Cohort {company.cohortYear}</span>}
        {warmPathCount != null && warmPathCount > 0 && (
          <span className="text-foreground inline-flex items-center gap-1">
            <UsersIcon className="size-3" />
            {warmPathCount} {warmPathCount === 1 ? "contact" : "contacts"} can introduce you
          </span>
        )}
        {(onShortlist || onPass) && (
          <span className="ml-auto flex gap-1">
            {onPass && company.status !== "passed" && (
              <Button size="sm" variant="ghost" onClick={onPass}>
                <XIcon />
                Pass
              </Button>
            )}
            {onShortlist && company.status !== "shortlisted" && (
              <Button size="sm" variant="outline" onClick={onShortlist}>
                <StarIcon />
                Shortlist
              </Button>
            )}
          </span>
        )}
      </footer>
    </article>
  );
}

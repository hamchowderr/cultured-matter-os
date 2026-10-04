"use client";

// The kit notes app's top bar (apps/notes/components/note-content.tsx): the folders button for
// small screens and the search box, plus the Archive's date range picker.

import { FolderIcon, SearchIcon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useListNavigation } from "@/components/layout/list-transition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "../../archive-filters";

export function NotesFilters({
  filters,
  folderLabel,
  folders
}: {
  filters: { query?: string; from?: string; to?: string };
  folderLabel?: string;
  // The folder sheet's trigger, shown below xl.
  folders: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { navigate } = useListNavigation();
  const [query, setQuery] = useState(filters.query ?? "");

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("note");
    const s = next.toString();
    navigate(s ? `${pathname}?${s}` : pathname, { replace: true });
  }

  useEffect(() => setQuery(filters.query ?? ""), [filters.query]);

  // Search as she types, after a short pause.
  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  const anyFilter = !!(filters.query || filters.from || filters.to || folderLabel);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 grow gap-3">
          {folders}
          <div className="relative grow">
            <SearchIcon className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="ps-9"
              aria-label="Search notes"
            />
          </div>
        </div>
        <DateRangeFilter
          label="Created"
          from={filters.from}
          to={filters.to}
          onChange={(range) => update(range)}
        />
        {anyFilter && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              update({
                q: undefined,
                from: undefined,
                to: undefined,
                folder: undefined,
                nofolder: undefined
              });
            }}
          >
            Reset
            <XIcon />
          </Button>
        )}
      </div>
      {folderLabel && (
        <Badge variant="secondary" className="gap-1.5 xl:hidden">
          <FolderIcon className="size-3" />
          {folderLabel}
        </Badge>
      )}
    </div>
  );
}

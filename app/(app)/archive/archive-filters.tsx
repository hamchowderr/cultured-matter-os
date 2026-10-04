"use client";

// Adapted from the filter bar of the shadcn UI kit notifications page
// (pages/notifications/data-table.tsx, v2.0.0): a wide search box and popover pickers.

import { CalendarIcon, CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useListNavigation } from "@/components/layout/list-transition";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ENTITY_TYPES, entityLabel } from "@/lib/activity";
import { cn } from "@/lib/utils";

export type ArchiveFilterState = { type?: string; from?: string; to?: string; query?: string };

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  });

export function ArchiveFilters({ filters }: { filters: ArchiveFilterState }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { navigate } = useListNavigation();
  const [query, setQuery] = useState(filters.query ?? "");
  const [typeOpen, setTypeOpen] = useState(false);

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    navigate(`${pathname}?${next.toString()}`, { replace: true });
  }

  // Follow the URL when a link on the page (Clear filters) changes it.
  useEffect(() => setQuery(filters.query ?? ""), [filters.query]);

  // Search as she types, after a short pause.
  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  const anyFilter = !!(filters.type || filters.from || filters.to || filters.query);
  const dateLabel =
    filters.from && filters.to
      ? `${shortDay(filters.from)} – ${shortDay(filters.to)}`
      : filters.from
        ? `From ${shortDay(filters.from)}`
        : filters.to
          ? `Until ${shortDay(filters.to)}`
          : "Any date";

  return (
    <div className="flex flex-wrap gap-3" data-tour-step-id="archive-filters">
      <div className="relative min-w-48 grow">
        <SearchIcon className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search what happened"
          className="ps-9"
          aria-label="Search the archive"
        />
      </div>
      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label="Kind of change">
            Kind
            {filters.type ? (
              <Badge variant="secondary">{entityLabel(filters.type)}</Badge>
            ) : (
              <ChevronDownIcon />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" align="end">
          <Command>
            <CommandInput placeholder="Kind" className="h-9" />
            <CommandList>
              <CommandEmpty>No kind found.</CommandEmpty>
              <CommandGroup>
                {[{ value: "", label: "Everything" }, ...ENTITY_TYPES].map((t) => (
                  <CommandItem
                    key={t.value || "all"}
                    value={t.label}
                    onSelect={() => {
                      setTypeOpen(false);
                      update({ type: t.value || undefined });
                    }}
                  >
                    {t.label}
                    <CheckIcon
                      className={cn(
                        "ml-auto",
                        (filters.type ?? "") === t.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label="Date range">
            <CalendarIcon />
            Date
            {filters.from || filters.to ? (
              <Badge variant="secondary">{dateLabel}</Badge>
            ) : (
              <ChevronDownIcon />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3" align="end">
          <label className="text-muted-foreground grid gap-1.5 text-sm">
            From
            <Input
              type="date"
              value={filters.from ?? ""}
              max={filters.to}
              onChange={(e) => update({ from: e.target.value || undefined })}
              aria-label="From date"
            />
          </label>
          <label className="text-muted-foreground grid gap-1.5 text-sm">
            To
            <Input
              type="date"
              value={filters.to ?? ""}
              min={filters.from}
              onChange={(e) => update({ to: e.target.value || undefined })}
              aria-label="To date"
            />
          </label>
          {(filters.from || filters.to) && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => update({ from: undefined, to: undefined })}
            >
              Any date
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {anyFilter && (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("");
            update({ type: undefined, from: undefined, to: undefined, q: undefined });
          }}
        >
          Reset
          <XIcon />
        </Button>
      )}
    </div>
  );
}

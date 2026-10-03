"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ENTITY_TYPES } from "@/lib/activity";
import { cn } from "@/lib/utils";

export type ArchiveFilterState = { type?: string; from?: string; to?: string; query?: string };

export function ArchiveFilters({ filters, total }: { filters: ArchiveFilterState; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query ?? "");

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Search as she types, after a short pause.
  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  const anyFilter = !!(filters.type || filters.from || filters.to || filters.query);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60"
      )}
    >
      <div className="relative w-full sm:w-64">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search what happened"
          className="h-8 pl-9"
          aria-label="Search the archive"
        />
      </div>
      <NativeSelect
        size="sm"
        className="w-auto"
        value={filters.type ?? ""}
        onChange={(e) => update({ type: e.target.value || undefined })}
        aria-label="Kind of change"
      >
        <NativeSelectOption value="">Everything</NativeSelectOption>
        {ENTITY_TYPES.map((t) => (
          <NativeSelectOption key={t.value} value={t.value}>
            {t.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
        From
        <Input
          type="date"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(e) => update({ from: e.target.value || undefined })}
          className="h-8 w-auto"
          aria-label="From date"
        />
      </label>
      <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
        To
        <Input
          type="date"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(e) => update({ to: e.target.value || undefined })}
          className="h-8 w-auto"
          aria-label="To date"
        />
      </label>
      <span className="text-muted-foreground text-sm">
        {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
      </span>
      {anyFilter && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setQuery("");
            update({ type: undefined, from: undefined, to: undefined, q: undefined });
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

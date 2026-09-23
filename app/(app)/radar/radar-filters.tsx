"use client";

import { SearchIcon, SparklesIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES } from "@/lib/categories";
import { STAGE_GROUPS } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { RADAR_VIEWS, type RadarView } from "./constants";

type Facets = {
  total: number;
  newCount: number;
  statuses: Record<string, number>;
  sources: { slug: string; name: string; count: number }[];
};

export type RadarFilterState = {
  view: RadarView;
  category?: string;
  stage?: string;
  source?: string;
  query?: string;
  newOnly: boolean;
};

export function RadarFilters({
  filters,
  facets,
  hasBaseline
}: {
  filters: RadarFilterState;
  facets: Facets | null;
  hasBaseline: boolean;
}) {
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

  const count = (statuses: readonly string[] | undefined) =>
    facets
      ? statuses
        ? statuses.reduce((s, st) => s + (facets.statuses[st] ?? 0), 0)
        : facets.total
      : null;

  const anyFilter =
    filters.category || filters.stage || filters.source || filters.query || filters.newOnly;

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
      <Tabs
        value={filters.view}
        onValueChange={(v) => update({ view: v === "review" ? undefined : v })}
      >
        <TabsList className="flex-wrap">
          {RADAR_VIEWS.map((v) => {
            const n = count(v.statuses);
            return (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
                {n != null && <span className="text-muted-foreground ml-1 tabular-nums">{n}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or description"
            className="h-8 pl-9"
            aria-label="Search companies"
          />
        </div>
        <NativeSelect
          size="sm"
          className="w-auto"
          value={filters.category ?? ""}
          onChange={(e) => update({ category: e.target.value || undefined })}
          aria-label="Category"
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {CATEGORIES.map((c) => (
            <NativeSelectOption key={c} value={c}>
              {c}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="w-auto"
          value={filters.stage ?? ""}
          onChange={(e) => update({ stage: e.target.value || undefined })}
          aria-label="Stage"
        >
          <NativeSelectOption value="">Any stage</NativeSelectOption>
          {STAGE_GROUPS.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="w-auto"
          value={filters.source ?? ""}
          onChange={(e) => update({ source: e.target.value || undefined })}
          aria-label="Source"
        >
          <NativeSelectOption value="">All sources</NativeSelectOption>
          {facets?.sources.map((s) => (
            <NativeSelectOption key={s.slug} value={s.slug}>
              {s.name} ({s.count})
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          variant={filters.newOnly ? "default" : "outline"}
          disabled={!hasBaseline}
          onClick={() => update({ new: filters.newOnly ? undefined : "1" })}
          title={hasBaseline ? undefined : "Available after your first visit"}
        >
          <SparklesIcon />
          New since last visit
          {facets && hasBaseline && <span className="tabular-nums">{facets.newCount}</span>}
        </Button>
        {anyFilter && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              update({
                category: undefined,
                stage: undefined,
                source: undefined,
                q: undefined,
                new: undefined
              });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

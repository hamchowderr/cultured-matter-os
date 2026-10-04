"use client";

import { SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useListNavigation } from "@/components/layout/list-transition";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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

type Props = {
  filters: RadarFilterState;
  facets: Facets | null;
  hasBaseline: boolean;
};

// Both halves write the same URL; a filter change always goes back to page one.
function useUpdate() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { navigate } = useListNavigation();

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    navigate(`${pathname}?${next.toString()}`, { replace: true });
  }
  return { update };
}

/** The status views (To review, Starred, ...) with their counts. */
export function RadarTabs({ filters, facets }: Omit<Props, "hasBaseline">) {
  const { update } = useUpdate();

  const count = (statuses: readonly string[] | undefined) =>
    facets
      ? statuses
        ? statuses.reduce((s, st) => s + (facets.statuses[st] ?? 0), 0)
        : facets.total
      : null;

  return (
    <Tabs
      value={filters.view}
      onValueChange={(v) => update({ view: v === "review" ? undefined : v })}
    >
      <div className="-mx-1 [scrollbar-width:none] overflow-x-auto px-1">
        <TabsList className="w-max">
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
      </div>
    </Tabs>
  );
}

/** Search and filters, laid out as the toolbar row of the kit's v2 leads card. */
export function RadarToolbar({ filters, facets, hasBaseline }: Props) {
  const { update } = useUpdate();
  const [query, setQuery] = useState(filters.query ?? "");

  // Follow the URL when a link elsewhere on the page (a summary card, Clear filters) changes it.
  useEffect(() => setQuery(filters.query ?? ""), [filters.query]);

  // Search as she types, after a short pause.
  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  const anyFilter =
    filters.category || filters.stage || filters.source || filters.query || filters.newOnly;

  return (
    <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-(--card-spacing) py-3">
      <InputGroup className="w-full max-w-64 shrink-0 @max-md/card:max-w-none">
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or description"
          aria-label="Search companies"
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
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
          <XIcon />
        </Button>
      )}
    </div>
  );
}

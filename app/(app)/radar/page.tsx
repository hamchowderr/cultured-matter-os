import { cookies } from "next/headers";

import { radarFacets, searchCompanies } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { CATEGORIES } from "@/lib/categories";
import { STAGE_GROUPS, type StageGroup } from "@/lib/stages";
import { generateMeta } from "@/lib/utils";
import { RADAR_BASELINE_COOKIE, RADAR_VIEWS, type RadarView } from "./constants";
import { RadarFilters } from "./radar-filters";
import { RadarList } from "./radar-list";
import { VisitMarker } from "./visit-marker";

export async function generateMetadata() {
  return generateMeta({
    title: "Radar",
    description: "Early-stage climate and materials startups from free feeds."
  });
}

const PAGE_SIZE = 24;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const baselineRaw = (await cookies()).get(RADAR_BASELINE_COOKIE)?.value;
  const baseline = baselineRaw ? new Date(Number(baselineRaw)) : undefined;

  const view = (RADAR_VIEWS.find((v) => v.value === one(sp.view)) ?? RADAR_VIEWS[0])
    .value as RadarView;
  const category = CATEGORIES.find((c) => c === one(sp.category));
  const stage = STAGE_GROUPS.find((s) => s === one(sp.stage)) as StageGroup | undefined;
  const source = one(sp.source) || undefined;
  const query = one(sp.q)?.trim() || undefined;
  const newOnly = one(sp.new) === "1" && !!baseline;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [list, facets] = await Promise.all([
    searchCompanies({
      query,
      categories: category ? [category] : undefined,
      stage,
      sourceSlug: source,
      statuses: [...(RADAR_VIEWS.find((v) => v.value === view)!.statuses ?? [])],
      seenSince: newOnly ? baseline : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    radarFacets({ newSince: baseline })
  ]);

  return (
    <div className="space-y-6">
      <VisitMarker />
      <PageHeader
        title="Radar"
        description="Early-stage climate and materials startups from SOSV, Greentown Labs, Y Combinator and CTVC."
      />
      <RadarFilters
        filters={{ view, category, stage, source, query, newOnly }}
        facets={facets.ok ? facets.data : null}
        hasBaseline={!!baseline}
      />
      {list.ok ? (
        <RadarList
          companies={list.data.companies}
          total={list.data.total}
          page={page}
          pageSize={PAGE_SIZE}
          newSince={baseline ?? null}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load companies: {list.error.message}</p>
      )}
    </div>
  );
}

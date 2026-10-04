import { cookies } from "next/headers";

import { countWarmPaths, radarFacets, searchCompanies } from "@/actions/server";
import { ListTransition } from "@/components/layout/list-transition";
import { PageHeader } from "@/components/layout/page-shell";
import { MONITORS } from "@/ingest/monitors/pages";
import { RADAR_SOURCES } from "@/ingest/radar/run";
import { CATEGORIES } from "@/lib/categories";
import { STAGE_GROUPS, type StageGroup } from "@/lib/stages";
import { generateMeta } from "@/lib/utils";
import { RADAR_BASELINE_COOKIE, RADAR_VIEWS, type RadarView } from "./constants";
import { RadarTabs, RadarToolbar } from "./radar-filters";
import { RadarList } from "./radar-list";
import { RadarSummary } from "./radar-summary";
import { VisitMarker } from "./visit-marker";

export async function generateMetadata() {
  return generateMeta({
    title: "Radar",
    description: "Early-stage climate and materials startups from free feeds."
  });
}

const PAGE_SIZE = 24;

// Built from the feeds and watched pages Radar actually reads, so it can't go stale.
const SOURCE_NAMES = [...RADAR_SOURCES, ...MONITORS].map((s) => s.name);
const SOURCES_LINE = `Early-stage climate and materials startups from ${SOURCE_NAMES.length} free sources: ${SOURCE_NAMES.slice(0, -1).join(", ")} and ${SOURCE_NAMES.at(-1)}.`;

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
  // One batched lookup for the visible page.
  const counts = list.ok
    ? await countWarmPaths({ companyIds: list.data.companies.map((c) => c.id) })
    : null;

  return (
    <ListTransition>
      <div className="space-y-4 lg:space-y-6">
        <VisitMarker />
        <PageHeader title="Radar" description={SOURCES_LINE} />
        {facets.ok && <RadarSummary facets={facets.data} />}
        <RadarTabs
          filters={{ view, category, stage, source, query, newOnly }}
          facets={facets.ok ? facets.data : null}
        />
        {list.ok ? (
          <RadarList
            toolbar={
              <RadarToolbar
                filters={{ view, category, stage, source, query, newOnly }}
                facets={facets.ok ? facets.data : null}
                hasBaseline={!!baseline}
              />
            }
            companies={list.data.companies}
            total={list.data.total}
            page={page}
            pageSize={PAGE_SIZE}
            newSince={baseline ?? null}
            warmPathCounts={counts?.ok ? counts.data.counts : undefined}
            radarEmpty={facets.ok && facets.data.total === 0}
          />
        ) : (
          <p className="text-destructive text-sm">Couldn’t load companies: {list.error.message}</p>
        )}
      </div>
    </ListTransition>
  );
}

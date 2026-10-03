// Adapted from the shadcn UI kit crm dashboard: the category card follows sales-pipeline.tsx (v2.0.0),
// fed by radarFacets. Status counts live on the tabs and the "new" count on its filter button,
// so they are not repeated here as stat cards.

import { InfoIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Facets = {
  total: number;
  statuses: Record<string, number>;
  categories: { name: string; count: number }[];
};

const BAR_COLORS = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
  "bg-[var(--chart-5)]"
];
const TOP = 5;

export function RadarSummary({ facets }: { facets: Facets }) {
  return (
    <TopCategories
      categories={facets.categories}
      total={facets.total - (facets.statuses.passed ?? 0)}
    />
  );
}

function TopCategories({
  categories,
  total
}: {
  categories: { name: string; count: number }[];
  total: number;
}) {
  const top = categories.slice(0, TOP).map((c, i) => ({ ...c, color: BAR_COLORS[i] }));
  const topSum = top.reduce((sum, c) => sum + c.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Top categories
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="text-muted-foreground size-3.5" aria-label="About this card" />
            </TooltipTrigger>
            <TooltipContent>
              Across {total.toLocaleString("en-US")} {total === 1 ? "company" : "companies"} on
              Radar, not counting passed.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-muted-foreground text-sm">No categories yet.</p>
        ) : (
          <>
            <TooltipProvider>
              <div className="mb-6 flex h-4 w-full overflow-hidden rounded-full">
                {top.map((c) => (
                  <Tooltip key={c.name}>
                    <TooltipTrigger asChild>
                      <div
                        className={`${c.color} h-full`}
                        style={{ width: `${(c.count / topSum) * 100}%` }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs">
                        {c.count} {c.count === 1 ? "company" : "companies"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
            <div className="space-y-3">
              {top.map((c) => (
                <Link
                  key={c.name}
                  href={`/radar?${new URLSearchParams({ view: "all", category: c.name })}`}
                  className="hover:bg-muted/50 -mx-2 flex items-center gap-4 rounded-md px-2 py-0.5"
                >
                  <div className={`size-3 shrink-0 rounded-full ${c.color}`} />
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <p className="text-sm font-medium">{c.name}</p>
                    <div className="flex w-28 items-center gap-2">
                      <Progress
                        value={total ? (c.count / total) * 100 : 0}
                        className="h-2"
                        indicatorColor={c.color}
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                        {c.count}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

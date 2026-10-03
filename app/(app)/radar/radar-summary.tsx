// Adapted from the shadcn UI kit crm dashboard: the stat cards follow total-customers.tsx
// and the category card follows sales-pipeline.tsx, fed by radarFacets.

import {
  BookmarkCheckIcon,
  InboxIcon,
  SparklesIcon,
  StarIcon,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Facets = {
  total: number;
  newCount: number;
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

export function RadarSummary({ facets, hasBaseline }: { facets: Facets; hasBaseline: boolean }) {
  const s = facets.statuses;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
        <StatCard
          label="New since last visit"
          value={hasBaseline ? facets.newCount : null}
          note={hasBaseline ? "Arrived since you last looked" : "Counted from your next visit"}
          icon={SparklesIcon}
          href={hasBaseline ? "/radar?view=all&new=1" : undefined}
        />
        <StatCard
          label="To review"
          value={(s.new ?? 0) + (s.starred ?? 0)}
          note="Not yet shortlisted or passed"
          icon={InboxIcon}
          href="/radar"
        />
        <StatCard
          label="Shortlisted"
          value={s.shortlisted ?? 0}
          note="Worth a closer look"
          icon={BookmarkCheckIcon}
          href="/radar?view=shortlisted"
        />
        <StatCard
          label="Starred"
          value={s.starred ?? 0}
          note="Saved to look at later"
          icon={StarIcon}
          href="/radar?view=starred"
        />
      </div>
      <TopCategories
        categories={facets.categories}
        total={facets.total - (s.passed ?? 0)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  href
}: {
  label: string;
  value: number | null;
  note: string;
  icon: LucideIcon;
  href?: string;
}) {
  const card = (
    <Card className={href ? "hover:bg-muted/50 h-full transition-colors" : "h-full"}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className="flex flex-col gap-2">
          <h4 className="font-display text-2xl tabular-nums lg:text-3xl">
            {value == null ? "–" : value.toLocaleString()}
          </h4>
          <div className="text-muted-foreground text-sm">{note}</div>
        </div>
        <CardAction>
          <div className="bg-muted flex size-12 items-center justify-center rounded-full border">
            <Icon className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl">
      {card}
    </Link>
  ) : (
    card
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
        <CardTitle>Top categories</CardTitle>
        <CardDescription>
          Across {total.toLocaleString()} {total === 1 ? "company" : "companies"} on Radar, not
          counting passed.
        </CardDescription>
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

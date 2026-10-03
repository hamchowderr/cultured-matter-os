import { ArchiveIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import type { ActivityEntry } from "@/actions/activity";
import { listActivity } from "@/actions/server";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  activityHref,
  dayHeading,
  endOfIsoDay,
  ENTITY_TYPES,
  entityLabel,
  groupByDay,
  isIsoDay,
  startOfIsoDay,
  timeIn
} from "@/lib/activity";
import { generateMeta } from "@/lib/utils";
import { ArchiveFilters } from "./archive-filters";

export async function generateMetadata() {
  return generateMeta({
    title: "Archive",
    description: "A timeline of everything you have done."
  });
}

const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = ENTITY_TYPES.find((t) => t.value === one(sp.type))?.value;
  const from = isIsoDay(one(sp.from)) ? one(sp.from) : undefined;
  const to = isIsoDay(one(sp.to)) ? one(sp.to) : undefined;
  const query = one(sp.q)?.trim() || undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const result = await listActivity({
    entityType: type,
    from: from ? startOfIsoDay(from) : undefined,
    to: to ? endOfIsoDay(to) : undefined,
    query,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE
  });

  const filtered = !!(type || from || to || query);

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, from, to, q: query })) if (v) next.set(k, v);
    if (p > 1) next.set("page", String(p));
    const s = next.toString();
    return s ? `/archive?${s}` : "/archive";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archive"
        description="Everything that has changed in the app, newest first: shortlists, passes, tasks, grants and more."
      />
      {!result.ok ? (
        <p className="text-destructive text-sm">
          Couldn’t load the archive: {result.error.message}
        </p>
      ) : result.data.total === 0 && !filtered ? (
        <ComingSoon
          icon={ArchiveIcon}
          title="Nothing logged yet"
          description="Every shortlist, pass, task and approval will be recorded here."
        />
      ) : (
        <>
          <ArchiveFilters filters={{ type, from, to, query }} total={result.data.total} />
          {result.data.entries.length === 0 ? (
            <ComingSoon
              icon={ArchiveIcon}
              title="Nothing matches"
              description="Try another search, kind or date range."
            />
          ) : (
            <Timeline entries={result.data.entries} />
          )}
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(result.data.total / PAGE_SIZE))}
            href={pageHref}
          />
        </>
      )}
    </div>
  );
}

function Timeline({ entries }: { entries: ActivityEntry[] }) {
  const now = new Date();
  return (
    <div className="space-y-6">
      {groupByDay(entries).map((group) => (
        <section key={group.day} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            {dayHeading(group.day, now)}
          </h2>
          <ol className="divide-y rounded-lg border">
            {group.rows.map((e) => {
              const href = activityHref(e);
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <time
                    dateTime={e.at.toISOString()}
                    className="text-muted-foreground w-16 shrink-0 pt-0.5 tabular-nums"
                  >
                    {timeIn(e.at)}
                  </time>
                  <p className="min-w-0 flex-1 break-words">{e.summary}</p>
                  <Badge variant="secondary" className="shrink-0">
                    {entityLabel(e.entityType)}
                  </Badge>
                  {href ? (
                    <Link
                      href={href}
                      className="text-primary inline-flex shrink-0 items-center gap-0.5 hover:underline"
                    >
                      Open
                      <ArrowUpRightIcon className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="w-12 shrink-0" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Pager({
  page,
  pages,
  href
}: {
  page: number;
  pages: number;
  href: (p: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-2" aria-label="Pages">
      <Button size="sm" variant="outline" disabled={page <= 1} asChild={page > 1}>
        {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span>Previous</span>}
      </Button>
      <span className="text-muted-foreground text-sm tabular-nums">
        {page} / {pages}
      </span>
      <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
        {page < pages ? <Link href={href(page + 1)}>Next</Link> : <span>Next</span>}
      </Button>
    </nav>
  );
}

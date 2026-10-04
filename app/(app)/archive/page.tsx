import {
  ArchiveIcon,
  ArrowUpRightIcon,
  FolderKanbanIcon,
  InboxIcon,
  LandmarkIcon,
  ListChecksIcon,
  NotebookPenIcon,
  RadarIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";

import type { ActivityEntry } from "@/actions/activity";
import { listActivity } from "@/actions/server";
import { ListLink, ListRegion, ListTransition } from "@/components/layout/list-transition";
import { CompactPager } from "@/components/layout/compact-pager";
import { PageHeader } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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
import { cn, generateMeta } from "@/lib/utils";
import { ArchiveFilters } from "./archive-filters";
import { ArchiveTabs } from "./archive-tabs";

export async function generateMetadata() {
  return generateMeta({
    title: "Archive",
    description: "A timeline of everything you have done."
  });
}

const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The page layout follows the shadcn UI kit notifications page (pages/notifications, v2.0.0).
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
    <div className="mx-auto max-w-4xl space-y-4 lg:space-y-6">
      <PageHeader
        title="Archive"
        tourId="archive-heading"
        description="Everything that has changed in the app, newest first: shortlists, passes, tasks, grants and more."
      />
      <ArchiveTabs current="activity" />
      {!result.ok ? (
        <p className="text-destructive text-sm">
          Couldn’t load the archive: {result.error.message}
        </p>
      ) : result.data.total === 0 && !filtered ? (
        <ArchiveEmpty
          title="Nothing logged yet"
          description="Every shortlist, pass, task and approval will be recorded here."
          action={{ href: "/radar", label: "Open Radar" }}
        />
      ) : (
        <ListTransition>
          <ArchiveFilters filters={{ type, from, to, query }} />
          <ListRegion className="space-y-4 lg:space-y-6">
            {result.data.total > PAGE_SIZE && result.data.entries.length > 0 && (
              <CompactPager
                className="justify-end"
                from={(page - 1) * PAGE_SIZE + 1}
                to={(page - 1) * PAGE_SIZE + result.data.entries.length}
                total={result.data.total}
                prev={page > 1 ? pageHref(page - 1) : null}
                next={page * PAGE_SIZE < result.data.total ? pageHref(page + 1) : null}
              />
            )}
            {result.data.entries.length === 0 ? (
              <ArchiveEmpty
                title="Nothing matches"
                description="Try another search, kind or date range."
                action={{ href: "/archive", label: "Clear filters" }}
              />
            ) : (
              <Timeline entries={result.data.entries} />
            )}
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              shown={result.data.entries.length}
              total={result.data.total}
              href={pageHref}
            />
          </ListRegion>
        </ListTransition>
      )}
    </div>
  );
}

// Icon and colour per kind of change, like the notification type styles in the kit.
const KIND_STYLE: Record<string, { icon: LucideIcon; iconClass: string; dotClass: string }> = {
  company: {
    icon: RadarIcon,
    iconClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dotClass: "bg-blue-500"
  },
  contact: {
    icon: UsersIcon,
    iconClass: "bg-green-500/10 text-green-600 dark:text-green-400",
    dotClass: "bg-green-500"
  },
  grant: {
    icon: LandmarkIcon,
    iconClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    dotClass: "bg-orange-500"
  },
  project: {
    icon: FolderKanbanIcon,
    iconClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    dotClass: "bg-purple-500"
  },
  task: {
    icon: ListChecksIcon,
    iconClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    dotClass: "bg-teal-500"
  },
  capture: {
    icon: InboxIcon,
    iconClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    dotClass: "bg-pink-500"
  },
  approval: {
    icon: ShieldCheckIcon,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500"
  },
  note: {
    icon: NotebookPenIcon,
    iconClass: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    dotClass: "bg-yellow-500"
  }
};
const FALLBACK_STYLE = {
  icon: ArchiveIcon,
  iconClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  dotClass: "bg-gray-500"
};

function Timeline({ entries }: { entries: ActivityEntry[] }) {
  const now = new Date();
  return (
    <div className="space-y-6">
      {groupByDay(entries).map((group, g) => (
        <section key={group.day} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            {dayHeading(group.day, now)}
          </h2>
          <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1">
            <Table>
              <TableBody>
                {group.rows.map((e, i) => (
                  // The tour points at the newest entry.
                  <EntryRow
                    key={e.id}
                    entry={e}
                    tourId={g === 0 && i === 0 ? "archive-timeline" : undefined}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

function EntryRow({ entry: e, tourId }: { entry: ActivityEntry; tourId?: string }) {
  const href = activityHref(e);
  const { icon: Icon, iconClass, dotClass } = KIND_STYLE[e.entityType] ?? FALLBACK_STYLE;
  const time = timeIn(e.at);
  return (
    <TableRow data-tour-step-id={tourId}>
      <TableCell className="w-full whitespace-normal">
        <div className="flex gap-4 p-2">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              iconClass
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium break-words">{e.summary}</p>
            <p className="text-muted-foreground text-sm sm:hidden">
              {entityLabel(e.entityType)} · {time}
            </p>
            {href && (
              <div className="pt-1">
                <Button size="sm" variant="outline" asChild>
                  <Link href={href}>
                    Open
                    <ArrowUpRightIcon />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-sm:hidden">
        <Badge variant="outline" className="text-muted-foreground gap-1.5">
          <span className={cn("size-1.5 rounded-full", dotClass)} />
          {entityLabel(e.entityType)}
        </Badge>
      </TableCell>
      <TableCell className="text-end max-sm:hidden">
        <time
          dateTime={e.at.toISOString()}
          className="text-muted-foreground pe-2 text-xs whitespace-nowrap tabular-nums"
        >
          {time}
        </time>
      </TableCell>
    </TableRow>
  );
}

// Adapted from the shadcn UI kit empty-states/01 page.
function ArchiveEmpty({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action: { href: string; label: string };
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ArchiveIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xl">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <ListLink href={action.href} replace>
            {action.label}
          </ListLink>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function Pager({
  page,
  pageSize,
  shown,
  total,
  href
}: {
  page: number;
  pageSize: number;
  shown: number;
  total: number;
  href: (p: number) => string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  return (
    <div className="flex items-center justify-end space-x-2">
      <div className="text-muted-foreground flex-1 text-sm tabular-nums">
        {shown > 0
          ? `Showing ${first.toLocaleString()} to ${(first + shown - 1).toLocaleString()} of `
          : ""}
        {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
      </div>
      {pages > 1 && (
        <nav className="space-x-2" aria-label="Pages">
          <Button size="sm" variant="outline" disabled={page <= 1} asChild={page > 1}>
            {page > 1 ? <ListLink href={href(page - 1)}>Previous</ListLink> : <span>Previous</span>}
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
            {page < pages ? <ListLink href={href(page + 1)}>Next</ListLink> : <span>Next</span>}
          </Button>
        </nav>
      )}
    </div>
  );
}

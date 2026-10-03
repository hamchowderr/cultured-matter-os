import {
  ArchiveIcon,
  ArrowUpRightIcon,
  FolderKanbanIcon,
  InboxIcon,
  LandmarkIcon,
  ListChecksIcon,
  RadarIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";

import type { ActivityEntry } from "@/actions/activity";
import { listActivity } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
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

export async function generateMetadata() {
  return generateMeta({
    title: "Archive",
    description: "A timeline of everything you have done."
  });
}

const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The page layout follows the shadcn UI kit notifications page (pages/notifications).
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
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Archive"
        description="Everything that has changed in the app, newest first: shortlists, passes, tasks, grants and more."
      />
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
        <>
          <ArchiveFilters filters={{ type, from, to, query }} />
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
        </>
      )}
    </div>
  );
}

// Icon and colour per kind of change, like the notification type badges in the kit.
const KIND_STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  company: { icon: RadarIcon, color: "bg-blue-500" },
  contact: { icon: UsersIcon, color: "bg-green-500" },
  grant: { icon: LandmarkIcon, color: "bg-orange-500" },
  project: { icon: FolderKanbanIcon, color: "bg-purple-500" },
  task: { icon: ListChecksIcon, color: "bg-teal-500" },
  capture: { icon: InboxIcon, color: "bg-pink-500" },
  approval: { icon: ShieldCheckIcon, color: "bg-amber-500" }
};
const FALLBACK_STYLE = { icon: ArchiveIcon, color: "bg-gray-500" };

function Timeline({ entries }: { entries: ActivityEntry[] }) {
  const now = new Date();
  return (
    <div className="space-y-6">
      {groupByDay(entries).map((group) => (
        <section key={group.day} className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">
            {dayHeading(group.day, now)}
          </h2>
          <div className="rounded-md border">
            <Table>
              <TableBody>
                {group.rows.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

function EntryRow({ entry: e }: { entry: ActivityEntry }) {
  const href = activityHref(e);
  const { icon: Icon, color } = KIND_STYLE[e.entityType] ?? FALLBACK_STYLE;
  const time = timeIn(e.at);
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="flex gap-4 rounded-md p-2">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
              color
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold break-words">{e.summary}</p>
            <p className="text-muted-foreground text-sm">
              {entityLabel(e.entityType)}
              <span className="sm:hidden"> · {time}</span>
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground hidden w-24 text-right tabular-nums sm:table-cell">
        <time dateTime={e.at.toISOString()}>{time}</time>
      </TableCell>
      <TableCell className="w-24 text-right">
        {href && (
          <Button size="sm" variant="outline" asChild>
            <Link href={href}>
              Open
              <ArrowUpRightIcon />
            </Link>
          </Button>
        )}
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
          <Link href={action.href}>{action.label}</Link>
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
            {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
            {page < pages ? <Link href={href(page + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </nav>
      )}
    </div>
  );
}

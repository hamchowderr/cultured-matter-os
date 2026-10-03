"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import {
  BookmarkPlusIcon,
  ExternalLinkIcon,
  RadarIcon,
  StarIcon,
  Undo2Icon,
  UsersIcon,
  XIcon,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  getCompany,
  passCompany,
  resetCompany,
  shortlistCompany,
  starCompany
} from "@/actions/server";
import type { Company } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WarmPaths } from "./warm-paths";

type RadarCompany = Company & { sources: string[] };
type Detail = Extract<Awaited<ReturnType<typeof getCompany>>, { ok: true }>["data"];
type NoteAction = { kind: "shortlist" | "pass"; company: RadarCompany };

export function RadarList({
  companies,
  total,
  page,
  pageSize,
  newSince,
  warmPathCounts = {},
  radarEmpty = false
}: {
  companies: RadarCompany[];
  total: number;
  page: number;
  pageSize: number;
  newSince: Date | null;
  warmPathCounts?: Record<string, number>;
  // True when Radar holds no companies at all, not just none matching the filters.
  radarEmpty?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [noteFor, setNoteFor] = useState<NoteAction | null>(null);
  // Kept separate so the dialog title does not change while it animates closed.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState<{ company: RadarCompany; data: Detail | null } | null>(null);

  async function run(
    company: RadarCompany,
    call: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>,
    done: string
  ) {
    setBusyId(company.id);
    const result = await call();
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(done);
    setDetail(null);
    startTransition(() => router.refresh());
  }

  async function openDetail(company: RadarCompany) {
    setDetail({ company, data: null });
    const result = await getCompany({ companyId: company.id });
    if (result.ok) setDetail({ company, data: result.data });
    else toast.error(result.error.message);
  }

  // ?company=<id> (e.g. from the Archive) opens that company's detail panel on arrival.
  const linkedId = params.get("company");
  useEffect(() => {
    if (!linkedId) return;
    getCompany({ companyId: linkedId }).then((result) => {
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const sources = [...new Set(result.data.sightings.map((s) => s.source))];
      setDetail({ company: { ...result.data.company, sources }, data: result.data });
    });
  }, [linkedId]);

  function confirmNote() {
    if (!noteFor) return;
    const { kind, company } = noteFor;
    const input = { companyId: company.id, note: note.trim() || undefined };
    setNoteOpen(false);
    setNote("");
    if (kind === "shortlist") {
      run(company, () => shortlistCompany(input), `Shortlisted ${company.name}`);
    } else {
      run(company, () => passCompany(input), `Passed on ${company.name}`);
    }
  }

  const pageHref = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${pathname}?${next.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters = ["q", "category", "stage", "source", "new"].some((k) => params.has(k));
  const view = params.get("view");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>
            {total.toLocaleString()} {total === 1 ? "company" : "companies"}
            {pages > 1 && ` · page ${page} of ${pages}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <RadarEmpty
              radarEmpty={radarEmpty}
              hasFilters={hasFilters}
              clearHref={view ? `${pathname}?view=${view}` : pathname}
              showAll={view !== "all"}
            />
          ) : (
            <CompaniesTable
              companies={companies}
              newSince={newSince}
              warmPathCounts={warmPathCounts}
              busyId={busyId}
              onOpen={openDetail}
              onStar={(c) => run(c, () => starCompany({ companyId: c.id }), `Starred ${c.name}`)}
              onShortlist={(c) => {
                setNoteFor({ kind: "shortlist", company: c });
                setNoteOpen(true);
              }}
              onPass={(c) => {
                setNoteFor({ kind: "pass", company: c });
                setNoteOpen(true);
              }}
              onReset={(c) =>
                run(c, () => resetCompany({ companyId: c.id }), `Moved ${c.name} back to review`)
              }
            />
          )}

          {pages > 1 && (
            <div className="flex items-center justify-end space-x-2 pt-4">
              <div className="text-muted-foreground flex-1 text-sm tabular-nums">
                Showing {((page - 1) * pageSize + 1).toLocaleString()} to{" "}
                {Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}
              </div>
              <nav className="space-x-2" aria-label="Pages">
                <Button size="sm" variant="outline" disabled={page <= 1} asChild={page > 1}>
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>Previous</Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
                  {page < pages ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
                </Button>
              </nav>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteFor?.kind === "shortlist" ? "Shortlist" : "Pass on"} {noteFor?.company.name}
            </DialogTitle>
            <DialogDescription>Add a note if you like. You can skip it.</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmNote();
            }}
            placeholder={
              noteFor?.kind === "pass" ? "Why pass? (optional)" : "What caught your eye? (optional)"
            }
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmNote}>
              {noteFor?.kind === "shortlist" ? "Shortlist" : "Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <CompanyDetail
              company={detail.company}
              data={detail.data}
              onWarmPathsChange={() => startTransition(() => router.refresh())}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// Adapted from the shadcn UI kit crm leads table (crm/components/leads.tsx). Paging and
// filtering run on the server, so the table only renders the current page.

const statusLabel: Record<Company["status"], string | null> = {
  new: null,
  starred: "Starred",
  shortlisted: "Shortlisted",
  passed: "Passed"
};

// Columns that drop out on narrow screens so the name and triage buttons always fit.
const HIDE_BELOW: Record<string, string> = {
  categories: "hidden md:table-cell",
  stage: "hidden xl:table-cell",
  sources: "hidden 2xl:table-cell",
  warm: "hidden lg:table-cell"
};

type RowHandler = (company: RadarCompany) => void;

function CompaniesTable({
  companies,
  newSince,
  warmPathCounts,
  busyId,
  onOpen,
  onStar,
  onShortlist,
  onPass,
  onReset
}: {
  companies: RadarCompany[];
  newSince: Date | null;
  warmPathCounts: Record<string, number>;
  busyId: string | null;
  onOpen: RowHandler;
  onStar: RowHandler;
  onShortlist: RowHandler;
  onPass: RowHandler;
  onReset: RowHandler;
}) {
  const columns = useMemo<ColumnDef<RadarCompany>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="max-w-md min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {newSince && c.firstSeenAt > newSince && <Badge variant="info">New</Badge>}
              </div>
              {c.website && (
                <a
                  href={c.website}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
                >
                  {c.domain ?? c.website}
                  <ExternalLinkIcon className="size-3" />
                </a>
              )}
              {c.description && (
                <p className="text-muted-foreground line-clamp-1 text-sm whitespace-normal">
                  {c.description}
                </p>
              )}
            </div>
          );
        }
      },
      {
        id: "categories",
        header: "Categories",
        cell: ({ row }) => {
          const cats = row.original.categories;
          if (cats.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {cats.slice(0, 2).map((cat) => (
                <Badge key={cat} variant="outline" className="font-normal">
                  {cat}
                </Badge>
              ))}
              {cats.length > 2 && (
                <Badge variant="outline" className="font-normal">
                  +{cats.length - 2}
                </Badge>
              )}
            </div>
          );
        }
      },
      {
        id: "stage",
        header: "Stage",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {[row.original.stage, row.original.cohortYear && `Cohort ${row.original.cohortYear}`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        )
      },
      {
        id: "sources",
        header: "Source",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.sources.join(", ") || "—"}</span>
        )
      },
      {
        id: "warm",
        header: "Warm paths",
        cell: ({ row }) => {
          const n = warmPathCounts[row.original.id] ?? 0;
          return n > 0 ? (
            <span
              className="inline-flex items-center gap-1"
              title={`${n} ${n === 1 ? "contact" : "contacts"} can introduce you`}
            >
              <UsersIcon className="size-3.5" />
              {n}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        }
      },
      {
        id: "actions",
        header: () => <div className="text-end">Status</div>,
        cell: ({ row }) => {
          const c = row.original;
          const busy = busyId === c.id;
          const status = statusLabel[c.status];
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {status && (
                <Badge variant="secondary" className="mr-1">
                  {status}
                </Badge>
              )}
              {c.status !== "new" && (
                <TriageButton
                  label="Undo"
                  icon={Undo2Icon}
                  busy={busy}
                  onClick={() => onReset(c)}
                />
              )}
              {c.status !== "passed" && (
                <TriageButton label="Pass" icon={XIcon} busy={busy} onClick={() => onPass(c)} />
              )}
              {c.status === "new" && (
                <TriageButton label="Star" icon={StarIcon} busy={busy} onClick={() => onStar(c)} />
              )}
              {c.status !== "shortlisted" && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onShortlist(c)}>
                  <BookmarkPlusIcon />
                  Shortlist
                </Button>
              )}
            </div>
          );
        }
      }
    ],
    [newSince, warmPathCounts, busyId, onStar, onShortlist, onPass, onReset]
  );

  const table = useReactTable({
    data: companies,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true
  });

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={cn("px-4", HIDE_BELOW[header.id])}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                className={cn(
                  "hover:bg-muted/50 focus-visible:bg-muted/50 cursor-pointer outline-none",
                  row.original.status === "passed" && "opacity-60"
                )}
                onClick={() => onOpen(row.original)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(row.original);
                  }
                }}
                aria-label={`Open ${row.original.name}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn("px-4 py-3", HIDE_BELOW[cell.column.id])}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

function TriageButton({
  label,
  icon: Icon,
  busy,
  onClick
}: {
  label: string;
  icon: LucideIcon;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" disabled={busy} onClick={onClick}>
          <Icon />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Adapted from the shadcn UI kit empty-states/01 page.
function RadarEmpty({
  radarEmpty,
  hasFilters,
  clearHref,
  showAll
}: {
  radarEmpty: boolean;
  hasFilters: boolean;
  clearHref: string;
  showAll: boolean;
}) {
  if (radarEmpty) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RadarIcon />
          </EmptyMedia>
          <EmptyTitle className="text-xl">No companies yet</EmptyTitle>
          <EmptyDescription>
            Radar fills itself from SOSV, Greentown Labs, Y Combinator and CTVC. New startups appear
            here after the next check.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadarIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xl">No companies match</EmptyTitle>
        <EmptyDescription>
          {hasFilters ? "Try clearing the filters or another tab." : "Nothing is in this tab yet."}
        </EmptyDescription>
      </EmptyHeader>
      {(hasFilters || showAll) && (
        <EmptyContent className="flex-row justify-center gap-2">
          {hasFilters && (
            <Button size="sm" asChild>
              <Link href={clearHref}>Clear filters</Link>
            </Button>
          )}
          {showAll && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/radar?view=all">Show all companies</Link>
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}

function CompanyDetail({
  company,
  data,
  onWarmPathsChange
}: {
  company: RadarCompany;
  data: Detail | null;
  onWarmPathsChange: () => void;
}) {
  const c = data?.company ?? company;
  const facts = [
    ["Stage", c.stage],
    ["Cohort", c.cohortYear ? String(c.cohortYear) : null],
    ["First seen", formatDate(c.firstSeenAt)]
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="space-y-6 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle className="text-xl">{c.name}</SheetTitle>
        {c.website && (
          <SheetDescription asChild>
            <a
              href={c.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {c.domain ?? c.website}
              <ExternalLinkIcon className="size-3" />
            </a>
          </SheetDescription>
        )}
      </SheetHeader>

      {c.description && <p className="text-sm leading-relaxed">{c.description}</p>}

      {c.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.categories.map((cat) => (
            <Badge key={cat} variant="outline">
              {cat}
            </Badge>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3 text-sm">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-xs">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {c.statusNote && (
        <div className="bg-muted rounded-md p-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs">Your note</p>
          {c.statusNote}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Sources</h3>
        {data ? (
          <ul className="space-y-1.5 text-sm">
            {data.sightings.map((s) => (
              <li key={s.source} className="flex items-center justify-between gap-2">
                {s.link ? (
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {s.source}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <span>{s.source}</span>
                )}
                <span className="text-muted-foreground text-xs">seen {formatDate(s.seenAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
      </section>

      <WarmPaths company={c} onChange={onWarmPathsChange} />
    </div>
  );
}

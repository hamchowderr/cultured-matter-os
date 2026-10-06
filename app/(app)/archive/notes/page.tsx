import { FolderIcon, NotebookPenIcon } from "lucide-react";

import { getNote, searchNotes } from "@/actions/server";
import { CompactPager } from "@/components/layout/compact-pager";
import { ListLink, ListRegion, ListTransition } from "@/components/layout/list-transition";
import { PageHeader } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { endOfIsoDay, isIsoDay, startOfIsoDay } from "@/lib/activity";
import { HOME_TIME_ZONE } from "@/lib/time";
import { cn, generateMeta } from "@/lib/utils";
import { ArchiveTabs } from "../archive-tabs";
import { FolderSheet } from "./components/folder-sheet";
import { NoteDialog } from "./components/note-dialog";
import { NotesFilters } from "./components/notes-filters";

export async function generateMetadata() {
  return generateMeta({
    title: "Notes",
    description: "Notes brought over from Apple Notes, searchable by word, folder and date."
  });
}

const PAGE_SIZE = 48;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const noteDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    timeZone: HOME_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  });

type Filters = { q?: string; folder?: string; nofolder?: string; from?: string; to?: string };

function hrefFor(filters: Filters, extra: Record<string, string | undefined> = {}) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `/archive/notes?${s}` : "/archive/notes";
}

// The layout follows the shadcn UI kit notes app (apps/notes): a folder list beside a search bar
// and a masonry of note cards. Folders sit in a sheet below the xl breakpoint, as in the kit.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const nofolder = one(sp.nofolder) === "1" ? "1" : undefined;
  const folder = nofolder ? undefined : one(sp.folder) || undefined;
  const from = isIsoDay(one(sp.from)) ? one(sp.from) : undefined;
  const to = isIsoDay(one(sp.to)) ? one(sp.to) : undefined;
  const q = one(sp.q)?.trim() || undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const openId = one(sp.note) || undefined;
  const filters: Filters = { q, folder, nofolder, from, to };

  const [result, opened] = await Promise.all([
    searchNotes({
      query: q,
      folder,
      noFolder: !!nofolder,
      from: from ? startOfIsoDay(from) : undefined,
      to: to ? endOfIsoDay(to) : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    openId ? getNote({ noteId: openId }) : null
  ]);

  const pageHref = (p: number) => hrefFor(filters, { page: p > 1 ? String(p) : undefined });
  const closeHref = hrefFor(filters, { page: page > 1 ? String(page) : undefined });

  return (
    <div className="mx-auto max-w-7xl space-y-4 lg:space-y-6">
      <PageHeader
        title="Notes"
        tourId="archive-heading"
        description="Notes brought over from Apple Notes. Search them, open one to read it, or file it to the Inbox to sort."
      />
      <ArchiveTabs current="notes" />
      {!result.ok ? (
        <p className="text-destructive text-sm">Couldn’t load the notes: {result.error.message}</p>
      ) : result.data.all === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle className="text-xl">No notes yet</EmptyTitle>
            <EmptyDescription>
              Run the Apple Notes Shortcut on the iPhone or Mac. Each note lands here with its
              folder and dates.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ListTransition>
          <div className="flex items-start xl:gap-4">
            <aside className="sticky top-4 hidden w-64 shrink-0 xl:block">
              <FolderList
                folders={result.data.folders}
                all={result.data.all}
                filters={filters}
                className="rounded-md border"
              />
            </aside>
            <div className="min-w-0 flex-1 space-y-4">
              <NotesFilters
                filters={{ query: q, from, to }}
                folderLabel={nofolder ? "No folder" : folder}
                folders={
                  <FolderSheet>
                    <FolderList
                      folders={result.data.folders}
                      all={result.data.all}
                      filters={filters}
                    />
                  </FolderSheet>
                }
              />
              <ListRegion className="space-y-4">
                {result.data.total > PAGE_SIZE && result.data.notes.length > 0 && (
                  <CompactPager
                    className="justify-end"
                    from={(page - 1) * PAGE_SIZE + 1}
                    to={(page - 1) * PAGE_SIZE + result.data.notes.length}
                    total={result.data.total}
                    prev={page > 1 ? pageHref(page - 1) : null}
                    next={page * PAGE_SIZE < result.data.total ? pageHref(page + 1) : null}
                  />
                )}
                {result.data.notes.length === 0 ? (
                  <Empty className="border border-dashed">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <NotebookPenIcon />
                      </EmptyMedia>
                      <EmptyTitle className="text-xl">No notes match</EmptyTitle>
                      <EmptyDescription>Try other words, another folder or dates.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent className="flex-row justify-center">
                      <Button size="sm" variant="outline" asChild>
                        <ListLink href="/archive/notes" replace>
                          Clear filters
                        </ListLink>
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div
                    className="grid items-start gap-4 sm:grid-cols-2 2xl:grid-cols-3"
                  >
                    {result.data.notes.map((n) => (
                      <ListLink
                        key={n.id}
                        href={hrefFor(filters, {
                          page: page > 1 ? String(page) : undefined,
                          note: n.id
                        })}
                        className="focus-visible:ring-ring/50 block rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
                      >
                        <Card className="gap-0 rounded-md py-0 transition-shadow hover:shadow-lg">
                          <CardContent className="space-y-3 py-5">
                            <h3 className="font-display text-lg leading-snug break-words">
                              {n.title}
                            </h3>
                            {n.empty ? (
                              <p className="text-muted-foreground text-sm italic">
                                No text came through (a locked note imports as its title only).
                              </p>
                            ) : (
                              <p className="text-muted-foreground line-clamp-6 text-sm break-words whitespace-pre-line">
                                {previewText(n.title, n.preview)}
                              </p>
                            )}
                            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                              {n.folder && (
                                <Badge variant="outline" className="max-w-full gap-1 truncate">
                                  <FolderIcon className="size-3" />
                                  {n.folder}
                                </Badge>
                              )}
                              {n.noteCreatedAt && (
                                <time dateTime={n.noteCreatedAt.toISOString()}>
                                  {noteDay(n.noteCreatedAt)}
                                </time>
                              )}
                              {n.captureId && <Badge variant="secondary">In the Inbox</Badge>}
                            </div>
                          </CardContent>
                        </Card>
                      </ListLink>
                    ))}
                  </div>
                )}
                {result.data.total > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {result.data.total.toLocaleString()}{" "}
                      {result.data.total === 1 ? "note" : "notes"}
                    </p>
                    {result.data.total > PAGE_SIZE && (
                      <CompactPager
                        from={(page - 1) * PAGE_SIZE + 1}
                        to={(page - 1) * PAGE_SIZE + result.data.notes.length}
                        total={result.data.total}
                        prev={page > 1 ? pageHref(page - 1) : null}
                        next={page * PAGE_SIZE < result.data.total ? pageHref(page + 1) : null}
                      />
                    )}
                  </div>
                )}
              </ListRegion>
            </div>
          </div>
          {opened && (
            <NoteDialog
              key={openId}
              closeHref={closeHref}
              note={
                opened.ok
                  ? {
                      id: opened.data.id,
                      title: opened.data.title,
                      body: opened.data.body,
                      folder: opened.data.folder,
                      created: opened.data.noteCreatedAt
                        ? noteDay(opened.data.noteCreatedAt)
                        : null,
                      modified: opened.data.noteModifiedAt
                        ? noteDay(opened.data.noteModifiedAt)
                        : null,
                      filed: opened.data.filed
                    }
                  : null
              }
            />
          )}
        </ListTransition>
      )}
    </div>
  );
}

// Apple Notes repeats the title as the body's first line; the card already shows it.
function previewText(title: string, preview: string) {
  const [first, ...rest] = preview.split("\n");
  return first.trim() === title.trim() ? rest.join("\n").trim() || preview : preview;
}

// The kit notes sidebar (note-sidebar.tsx): one row per folder with its count.
function FolderList({
  folders,
  all,
  filters,
  className
}: {
  folders: { folder: string | null; count: number }[];
  all: number;
  filters: Filters;
  className?: string;
}) {
  const base = { q: filters.q, from: filters.from, to: filters.to };
  const rows = [
    {
      key: "all",
      label: "All notes",
      count: all,
      href: hrefFor(base),
      active: !filters.folder && !filters.nofolder
    },
    ...folders.map((f) =>
      f.folder == null
        ? {
            key: "none",
            label: "No folder",
            count: f.count,
            href: hrefFor({ ...base, nofolder: "1" }),
            active: !!filters.nofolder
          }
        : {
            key: `f:${f.folder}`,
            label: f.folder,
            count: f.count,
            href: hrefFor({ ...base, folder: f.folder }),
            active: filters.folder === f.folder
          }
    )
  ];
  return (
    <nav
      aria-label="Folders"
      className={cn("space-y-1 p-2", className)}
     
    >
      <p className="text-muted-foreground px-2 pt-1 pb-2 text-sm font-medium">Folders</p>
      {rows.map((r) => (
        <Button
          key={r.key}
          variant="ghost"
          className={cn("w-full justify-start font-normal", r.active && "bg-muted font-medium")}
          asChild
        >
          <ListLink href={r.href} replace aria-current={r.active ? "page" : undefined}>
            {r.key === "all" ? <NotebookPenIcon /> : <FolderIcon />}
            <span className="truncate">{r.label}</span>
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {r.count.toLocaleString()}
            </span>
          </ListLink>
        </Button>
      ))}
    </nav>
  );
}

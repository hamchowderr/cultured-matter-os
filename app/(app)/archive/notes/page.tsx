import { InboxIcon, NotebookPenIcon } from "lucide-react";

import { getNote, searchNotes } from "@/actions/server";
import { CompactPager } from "@/components/layout/compact-pager";
import { ListLink, ListRegion, ListTransition } from "@/components/layout/list-transition";
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
import { previewFromMarkdown } from "@/lib/note-markdown";
import { HOME_TIME_ZONE } from "@/lib/time";
import { cn, generateMeta } from "@/lib/utils";
import { ArchiveTabs } from "../archive-tabs";
import { NotePane } from "./components/note-pane";
import { NotesFilters } from "./components/notes-filters";

export async function generateMetadata() {
  return generateMeta({
    title: "Notes",
    description: "Notes written here or brought over from Apple Notes, searchable and editable."
  });
}

const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const noteDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    timeZone: HOME_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  });

const shortDay = (d: Date) => {
  const sameYear =
    d.toLocaleDateString("en-US", { timeZone: HOME_TIME_ZONE, year: "numeric" }) ===
    new Date().toLocaleDateString("en-US", { timeZone: HOME_TIME_ZONE, year: "numeric" });
  return d.toLocaleDateString("en-US", {
    timeZone: HOME_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });
};

type Filters = { q?: string; folder?: string; nofolder?: string };

function hrefFor(filters: Filters, extra: Record<string, string | undefined> = {}) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `/archive/notes?${s}` : "/archive/notes";
}

// Two panes, like Apple Notes: the list of notes on the left (search, folder, New note), the open
// note on the right, editable in place. On a phone the list and the note take turns.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const nofolder = one(sp.nofolder) === "1" ? "1" : undefined;
  const folder = nofolder ? undefined : one(sp.folder) || undefined;
  const q = one(sp.q)?.trim() || undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const openId = one(sp.note) || undefined;
  const filters: Filters = { q, folder, nofolder };
  const pageParam = page > 1 ? String(page) : undefined;

  const [result, opened] = await Promise.all([
    searchNotes({
      query: q,
      folder,
      noFolder: !!nofolder,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    openId ? getNote({ noteId: openId }) : null
  ]);

  const pageHref = (p: number) =>
    hrefFor(filters, { page: p > 1 ? String(p) : undefined, note: openId });
  const closeHref = hrefFor(filters, { page: pageParam });

  return (
    <div className="mx-auto max-w-7xl space-y-4 lg:space-y-6">
      <PageHeader
        title="Notes"
        tourId="archive-heading"
        description="Your notes, written here or brought over from Apple Notes. Pick one to read or edit it; changes save as you type."
      />
      <ArchiveTabs current="notes" />
      {!result.ok ? (
        <p className="text-destructive text-sm">Couldn’t load the notes: {result.error.message}</p>
      ) : (
        <ListTransition>
          <div className="bg-card ring-foreground/10 flex h-[calc(100dvh-var(--header-height)-14rem)] min-h-[480px] overflow-hidden rounded-xl ring-1 lg:grid lg:grid-cols-[20rem_1fr]">
            <section
              aria-label="Notes"
              className={cn("flex min-h-0 w-full flex-col lg:border-e", openId && "hidden lg:flex")}
            >
              <NotesFilters
                query={q}
                folder={folder}
                noFolder={!!nofolder}
                folders={result.data.folders}
                all={result.data.all}
              />
              <ListRegion className="min-h-0 flex-1 overflow-y-auto">
                {result.data.notes.length === 0 ? (
                  <Empty className="h-full">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <NotebookPenIcon />
                      </EmptyMedia>
                      <EmptyTitle>
                        {result.data.all === 0 ? "No notes yet" : "No notes match"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {result.data.all === 0
                          ? "Start one with New note, or run the Apple Notes Shortcut to bring yours over."
                          : "Try other words or another folder."}
                      </EmptyDescription>
                    </EmptyHeader>
                    {result.data.all > 0 && (
                      <EmptyContent>
                        <Button size="sm" variant="outline" asChild>
                          <ListLink href="/archive/notes" replace>
                            Show all notes
                          </ListLink>
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                ) : (
                  <ul className="divide-y">
                    {result.data.notes.map((n) => {
                      const active = n.id === openId;
                      const preview = n.empty
                        ? "No text came through"
                        : previewFromMarkdown(n.title, n.preview);
                      return (
                        <li key={n.id}>
                          <ListLink
                            href={hrefFor(filters, { page: pageParam, note: n.id })}
                            aria-current={active ? "true" : undefined}
                            className={cn(
                              "hover:bg-muted/60 focus-visible:ring-ring/50 block px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset",
                              active && "bg-muted hover:bg-muted"
                            )}
                          >
                            <p className="truncate text-sm font-medium">{n.title}</p>
                            <p className="text-muted-foreground mt-0.5 flex gap-2 text-xs">
                              {n.noteCreatedAt && (
                                <time
                                  className="shrink-0 tabular-nums"
                                  dateTime={(n.noteModifiedAt ?? n.noteCreatedAt).toISOString()}
                                >
                                  {shortDay(n.noteModifiedAt ?? n.noteCreatedAt)}
                                </time>
                              )}
                              <span className="truncate">{preview || "No more text"}</span>
                            </p>
                            {(n.captureId || (n.folder && !folder && !nofolder)) && (
                              <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                                {n.folder && !folder && !nofolder && (
                                  <span className="truncate">{n.folder}</span>
                                )}
                                {n.captureId && (
                                  <span className="inline-flex shrink-0 items-center gap-1">
                                    <InboxIcon className="size-3" />
                                    In the Inbox
                                  </span>
                                )}
                              </p>
                            )}
                          </ListLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ListRegion>
              {result.data.total > 0 && (
                <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2 text-xs">
                  <span className="tabular-nums">
                    {result.data.total.toLocaleString()}{" "}
                    {result.data.total === 1 ? "note" : "notes"}
                  </span>
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
            </section>
            <section
              aria-label="Open note"
              className={cn("min-h-0 w-full flex-col", openId ? "flex" : "hidden lg:flex")}
            >
              {opened?.ok ? (
                <NotePane
                  key={opened.data.id}
                  closeHref={closeHref}
                  note={{
                    id: opened.data.id,
                    title: opened.data.title,
                    body: opened.data.body,
                    folder: opened.data.folder,
                    created: opened.data.noteCreatedAt ? noteDay(opened.data.noteCreatedAt) : null,
                    modified: opened.data.noteModifiedAt
                      ? noteDay(opened.data.noteModifiedAt)
                      : null,
                    fromApple: opened.data.source !== "app",
                    filed: opened.data.filed
                  }}
                />
              ) : (
                <Empty className="h-full">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <NotebookPenIcon />
                    </EmptyMedia>
                    <EmptyTitle>{openId ? "Note not found" : "Pick a note"}</EmptyTitle>
                    <EmptyDescription>
                      {openId
                        ? "It may have been deleted. Pick another from the list."
                        : "Choose a note from the list to read or edit it, or start a New note."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {openId && (
                    <EmptyContent>
                      <Button size="sm" variant="outline" className="lg:hidden" asChild>
                        <ListLink href={closeHref}>Back to notes</ListLink>
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              )}
            </section>
          </div>
        </ListTransition>
      )}
    </div>
  );
}

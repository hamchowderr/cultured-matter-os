"use client";

import * as React from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CheckIcon, Maximize2Icon, SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { setGrantStatus } from "@/actions/server";
import type { Grant } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import * as Kanban from "@/components/ui/kanban";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysUntil, formatAmount, formatDeadline } from "@/lib/format";
import { cn } from "@/lib/utils";

import { GrantDialog } from "./grant-dialog";
import { GrantsCalendar, type CalendarTask } from "./grants-calendar";

type Status = NonNullable<Grant["status"]>;
type ColumnKey = Status | "new";
type Columns = Record<ColumnKey, Grant[]>;

const COLUMNS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "new", label: "Found", hint: "Not on the board yet" },
  { key: "watching", label: "Watching", hint: "Worth keeping an eye on" },
  { key: "applying", label: "Applying", hint: "Working on an application" },
  { key: "submitted", label: "Submitted", hint: "Waiting to hear back" },
  { key: "passed", label: "Passed", hint: "Not pursuing" }
];
const label = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)!.label;

// Soonest deadline first, rolling (no deadline) last — the same order searchGrants returns.
function byDeadline(a: Grant, b: Grant) {
  if (!a.deadline) return b.deadline ? 1 : 0;
  if (!b.deadline) return -1;
  return a.deadline.getTime() - b.deadline.getTime();
}

function group(grants: Grant[]): Columns {
  const columns = Object.fromEntries(COLUMNS.map((c) => [c.key, [] as Grant[]])) as Columns;
  for (const g of grants) columns[g.status ?? "new"].push(g);
  for (const key of Object.keys(columns) as ColumnKey[]) columns[key].sort(byDeadline);
  return columns;
}

function columnOf(columns: Columns, grantId: string) {
  return (Object.keys(columns) as ColumnKey[]).find((k) =>
    columns[k].some((g) => g.id === grantId)
  );
}

export default function GrantsKanban({
  grants,
  tasks,
  filters,
  view
}: {
  grants: Grant[];
  tasks: CalendarTask[];
  filters: { query?: string; closingSoon: boolean; includeNonprofit: boolean };
  view: "board" | "calendar";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const [columns, setColumnsState] = React.useState<Columns>(() => group(grants));
  const columnsRef = React.useRef(columns);
  const setColumns = React.useCallback((next: Columns) => {
    columnsRef.current = next;
    setColumnsState(next);
  }, []);
  // The server copy wins whenever it changes (after a save, a refresh or a filter).
  React.useEffect(() => setColumns(group(grants)), [grants, setColumns]);

  const dragFrom = React.useRef<{ column: ColumnKey; snapshot: Columns } | null>(null);
  // The click that ends a drag must not also open the card.
  const dragging = React.useRef(false);
  const endDrag = () => setTimeout(() => (dragging.current = false));
  const [openGrant, setOpenGrant] = React.useState<Grant | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(filters.query ?? "");

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  React.useEffect(() => {
    if (searchQuery === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: searchQuery.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Switching tabs is instant; the URL keeps the choice for reloads and links.
  const [tab, setTab] = React.useState(view);
  function changeTab(v: string) {
    const next = new URLSearchParams(window.location.search);
    if (v === "board") next.delete("view");
    else next.set("view", v);
    setTab(v as typeof view);
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  const activeFilters = [filters.closingSoon, filters.includeNonprofit].filter(Boolean).length;

  // Saves a move that is already on screen; puts the board back if the save fails.
  async function save(grant: Grant, status: Status, snapshot: Columns) {
    const result = await setGrantStatus({ grantId: grant.id, status });
    if (!result.ok) {
      setColumns(snapshot);
      toast.error(`Couldn’t move “${grant.title}”: ${result.error.message}`);
      return;
    }
    toast.success(`Moved to ${label(status)}`);
    startTransition(() => router.refresh());
  }

  function onValueChange(next: Record<string, Grant[]>) {
    const current = columnsRef.current;
    // A grant can't go back to Found: the board has no "unset" status.
    const intoFound = next.new.some((g) => !current.new.some((c) => c.id === g.id));
    if (intoFound) return;
    const sorted = { ...next } as Columns;
    for (const key of Object.keys(sorted) as ColumnKey[])
      sorted[key] = [...sorted[key]].sort(byDeadline);
    setColumns(sorted);
  }

  function onDragStart(event: DragStartEvent) {
    const column = columnOf(columnsRef.current, String(event.active.id));
    dragFrom.current = column ? { column, snapshot: columnsRef.current } : null;
    dragging.current = true;
  }

  function onDragEnd(event: DragEndEvent) {
    const from = dragFrom.current;
    dragFrom.current = null;
    endDrag();
    if (!from) return;
    const id = String(event.active.id);
    const to = columnOf(columnsRef.current, id);
    if (!to || to === from.column || to === "new") return;
    if (!event.over) {
      // Dropped outside the board: undo the preview.
      setColumns(from.snapshot);
      return;
    }
    const grant = columnsRef.current[to].find((g) => g.id === id)!;
    setColumns({
      ...columnsRef.current,
      [to]: columnsRef.current[to].map((g) => (g.id === id ? { ...g, status: to } : g))
    });
    void save(grant, to, from.snapshot);
  }

  function onDragCancel() {
    if (dragFrom.current) setColumns(dragFrom.current.snapshot);
    dragFrom.current = null;
    endDrag();
  }

  // The status menu in the grant dialog moves a grant without dragging.
  function moveFromDialog(grant: Grant, status: Status) {
    const snapshot = columnsRef.current;
    const from = columnOf(snapshot, grant.id);
    if (!from || from === status) return;
    const moved = { ...grant, status };
    setColumns({
      ...snapshot,
      [from]: snapshot[from].filter((g) => g.id !== grant.id),
      [status]: [...snapshot[status], moved].sort(byDeadline)
    });
    setOpenGrant(moved);
    void save(moved, status, snapshot);
  }

  const FilterDropdown = () => {
    return (
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontalIcon />
            <span className="hidden lg:inline">
              {activeFilters > 0 ? <>Filters ({activeFilters})</> : "Filters"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="end">
          <Command>
            <CommandList>
              <CommandGroup heading="Show">
                <CommandItem
                  onSelect={() => update({ soon: filters.closingSoon ? undefined : "1" })}
                >
                  <CheckIcon className={cn(!filters.closingSoon && "invisible")} />
                  <span>Closing within 30 days</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => update({ all: filters.includeNonprofit ? undefined : "1" })}
                >
                  <CheckIcon className={cn(!filters.includeNonprofit && "invisible")} />
                  <span>Include nonprofit-only</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    update({ soon: undefined, all: undefined });
                    setFiltersOpen(false);
                  }}
                  className="justify-center text-center"
                >
                  Clear Filters
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")}>
      <Tabs value={tab} onValueChange={changeTab} className="w-full">
        <div className="mb-2 flex justify-between gap-2">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {grants.length} {grants.length === 1 ? "grant" : "grants"}
            </span>
            <div className="relative hidden w-auto lg:block">
              <SearchIcon className="absolute top-2.5 left-3 size-4 opacity-50" />
              <Input
                placeholder="Search grants..."
                aria-label="Search grants"
                className="ps-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="none lg:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" aria-label="Search grants">
                    <SearchIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="end">
                  <Input
                    placeholder="Search grants..."
                    aria-label="Search grants"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <FilterDropdown />
          </div>
        </div>
        <TabsContent value="board">
          <Kanban.Root
            value={columns}
            onValueChange={onValueChange}
            getItemValue={(item) => item.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <Kanban.Board className="flex w-full gap-4 overflow-x-auto pb-4">
              {COLUMNS.map(({ key, label, hint }) => {
                const items = columns[key];
                return (
                  <Kanban.Column key={key} value={key} className="w-[300px] min-w-[300px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{label}</span>
                        <Badge variant="outline">{items.length}</Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs">{hint}</p>
                    {items.length > 0 ? (
                      <div className="flex flex-col gap-2 p-0.5">
                        {items.map((grant) => (
                          <Kanban.Item key={grant.id} value={grant.id} asHandle asChild>
                            <GrantKanbanCard
                              grant={grant}
                              onOpen={() => !dragging.current && setOpenGrant(grant)}
                            />
                          </Kanban.Item>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center gap-4 pt-4">
                        <div className="text-muted-foreground text-sm">
                          {key === "new" ? "No new grants." : "Drag a grant here."}
                        </div>
                      </div>
                    )}
                  </Kanban.Column>
                );
              })}
            </Kanban.Board>
            <Kanban.Overlay>
              <div className="bg-primary/10 size-full rounded-md" />
            </Kanban.Overlay>
          </Kanban.Root>
        </TabsContent>
        <TabsContent value="calendar">
          <GrantsCalendar grants={grants} tasks={tasks} onOpenGrant={setOpenGrant} />
        </TabsContent>
      </Tabs>

      <GrantDialog
        grant={openGrant}
        onOpenChange={(open) => !open && setOpenGrant(null)}
        onStatusChange={moveFromDialog}
      />
    </div>
  );
}

// Keeps the open button from starting a drag: the item listens for mouse, touch and key down.
// A click anywhere on the card opens it; the button is the keyboard route (Space and Enter on
// the card itself pick it up to move).
const stopDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation()
};

const GrantKanbanCard = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Card> & { grant: Grant; onOpen: () => void }
>(function GrantKanbanCard({ grant, onOpen, className, ...props }, ref) {
  const amount = formatAmount(grant.amountMin, grant.amountMax);
  const days = grant.deadline ? daysUntil(grant.deadline) : null;
  const urgent = days != null && days >= 0 && days <= 14;

  return (
    <Card
      ref={ref}
      className={cn("gap-4 border-0 py-4", className)}
      {...props}
      onClick={onOpen}
    >
      <CardHeader className="px-4">
        <CardTitle className="text-sm leading-snug font-semibold">{grant.title}</CardTitle>
        {grant.agency && <CardDescription>{grant.agency}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={urgent ? "warning" : "outline"}>{formatDeadline(grant.deadline)}</Badge>
          {amount && <Badge variant="outline">{amount}</Badge>}
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          {grant.forProfitEligible ? (
            <Badge variant="success">For-profit eligible</Badge>
          ) : (
            <Badge variant="secondary">Nonprofit only</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Open ${grant.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            {...stopDrag}
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

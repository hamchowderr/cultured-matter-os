"use client";

// Ported from the kit's project-management/components/table-recent-projects.tsx (v2.0.0). Projects
// most recently changed come first; client becomes business, deadline becomes the next due
// task, and progress is the share of the project's tasks that are done.

import * as React from "react";
import {
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ListFilterIcon,
  SearchIcon
} from "lucide-react";
import { type SortingState, flexRender } from "@tanstack/react-table";
import {
  type LegacyColumnDef as ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable as useReactTable
} from "@tanstack/react-table/legacy";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDate, formatDue, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { projectProgress, type ProjectSummary } from "../types";

export type ProjectStatus = ProjectSummary["status"];

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Finished"
};

const projectStatusVariant: Record<ProjectStatus, "success" | "warning" | "info"> = {
  active: "success",
  paused: "warning",
  done: "info"
};

const projectStatusDot: Record<ProjectStatus, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  done: "bg-blue-500"
};

type Row = ProjectSummary & { nextDue: Date | null };

// Columns that drop out on phones and small tablets, so name, status and actions always fit.
const HIDE_ON_PHONE: Record<string, string> = {
  business: "max-md:hidden",
  createdAt: "max-md:hidden",
  nextDue: "max-sm:hidden",
  progress: "max-lg:hidden"
};

export function TableRecentProjects({
  projects,
  nextDue,
  onOpen,
  onSetStatus
}: {
  projects: ProjectSummary[];
  // Earliest due date of an open task, per project id.
  nextDue: Map<string, Date>;
  onOpen: (projectId: string) => void;
  onSetStatus: (project: ProjectSummary, status: ProjectStatus) => void;
}) {
  const data = React.useMemo<Row[]>(
    () =>
      [...projects]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((p) => ({ ...p, nextDue: nextDue.get(p.id) ?? null })),
    [projects, nextDue]
  );

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Project",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onOpen(row.original.id)}
            className="block max-w-full truncate text-left font-medium hover:underline"
          >
            {row.original.name}
          </button>
        ),
        enableHiding: false
      },
      {
        accessorKey: "business",
        size: 200,
        header: "Business",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback>{initials(row.original.business)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{row.original.business}</span>
          </div>
        )
      },
      {
        accessorKey: "createdAt",
        size: 120,
        header: "Started",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            {formatDate(row.original.createdAt)}
          </span>
        )
      },
      {
        accessorKey: "nextDue",
        size: 130,
        header: "Next due",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            {row.original.nextDue ? formatDue(row.original.nextDue) : "—"}
          </span>
        )
      },
      {
        accessorKey: "status",
        size: 110,
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return <Badge variant={projectStatusVariant[status]}>{projectStatusLabel[status]}</Badge>;
        }
      },
      {
        id: "progress",
        accessorFn: projectProgress,
        size: 160,
        header: "Progress",
        cell: ({ row }) => {
          const value = projectProgress(row.original);
          return (
            <div className="flex items-center gap-2">
              <Progress value={value} className="h-1.5" aria-label="Tasks done" />
              <span className="text-muted-foreground text-xs tabular-nums">{value}%</span>
            </div>
          );
        }
      },
      {
        id: "actions",
        enableHiding: false,
        size: 56,
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="text-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <span className="sr-only">Open menu</span>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onOpen(project.id)}>View tasks</DropdownMenuItem>
                  {(["active", "paused", "done"] as const)
                    .filter((s) => s !== project.status)
                    .map((s) => (
                      <DropdownMenuItem key={s} onClick={() => onSetStatus(project, s)}>
                        Mark {projectStatusLabel[s].toLowerCase()}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }
      }
    ],
    [onOpen, onSetStatus]
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [search, setSearch] = React.useState("");
  const [statuses, setStatuses] = React.useState<ProjectStatus[]>([]);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter(
      (p) =>
        (statuses.length === 0 || statuses.includes(p.status)) &&
        (!q || [p.name, p.business].some((v) => v.toLowerCase().includes(q)))
    );
  }, [data, search, statuses]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 6
      }
    }
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const firstRow = rows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, rows.length);

  const toggleStatus = (status: ProjectStatus, on: boolean) => {
    setStatuses((prev) => (on ? [...prev, status] : prev.filter((s) => s !== status)));
    table.setPageIndex(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent projects</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col p-0 [&_[data-slot=table-container]]:flex-1">
        <div className="flex min-h-14 items-center gap-2 px-(--card-spacing) py-3">
          <InputGroup className="w-full max-w-56 shrink-0 @max-md/card:min-w-24 @max-md/card:flex-1 @max-md/card:basis-0">
            <InputGroupInput
              placeholder="Search project, business..."
              aria-label="Search projects"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                table.setPageIndex(0);
              }}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ListFilterIcon /> Filters
                {statuses.length > 0 && (
                  <Badge variant="secondary" className="px-1.5 tabular-nums">
                    {statuses.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuGroup>
                {(["active", "paused", "done"] as const).map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statuses.includes(status)}
                    onCheckedChange={(on) => toggleStatus(status, !!on)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className={cn("size-2 rounded-full", projectStatusDot[status])} />
                    {projectStatusLabel[status]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              {statuses.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setStatuses([]);
                      table.setPageIndex(0);
                    }}
                  >
                    <CheckIcon className="invisible" />
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Table className="md:min-w-[860px] md:table-fixed [&_td:first-child]:ps-(--card-spacing) [&_td:last-child]:pe-(--card-spacing) [&_th:first-child]:ps-(--card-spacing) [&_th:last-child]:pe-(--card-spacing)">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={HIDE_ON_PHONE[header.column.id]}
                    style={{
                      // 150 is TanStack's default size: only sized columns get a width.
                      width: header.getSize() !== 150 ? header.getSize() : undefined
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={HIDE_ON_PHONE[cell.column.id]}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {data.length ? "No projects match." : "No projects yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-2 border-t px-(--card-spacing) py-3">
          <div className="text-muted-foreground flex-1 text-sm tabular-nums">
            {firstRow} - {lastRow} of {rows.length} {rows.length === 1 ? "project" : "projects"}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Previous page</span>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Next page</span>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

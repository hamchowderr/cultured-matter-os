"use client";

// Ported from the kit's project-management/components/table-recent-projects.tsx. Projects
// most recently changed come first; client becomes business, deadline becomes the next due
// task, and progress is the share of the project's tasks that are done.

import * as React from "react";
import { ChevronDownIcon, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import {
  type ColumnFiltersState,
  type SortingState,
  type ColumnVisibilityState as VisibilityState,
  flexRender
} from "@tanstack/react-table";
import {
  type LegacyColumnDef as ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { projectProgress, type ProjectSummary } from "../types";

export type ProjectStatus = ProjectSummary["status"];

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Finished"
};

export const projectStatusClass: Record<ProjectStatus, string> = {
  paused: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  active: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  done: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
};

type Row = ProjectSummary & { nextDue: Date | null };

const COLUMN_LABEL: Record<string, string> = {
  business: "Business",
  createdAt: "Started",
  nextDue: "Next due",
  status: "Status",
  progress: "Progress"
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
            className="text-left font-medium hover:underline"
          >
            {row.original.name}
          </button>
        ),
        enableHiding: false
      },
      {
        accessorKey: "business",
        header: "Business",
        cell: ({ row }) => (
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarFallback>{initials(row.original.business)}</AvatarFallback>
            </Avatar>
            {row.original.business}
          </div>
        )
      },
      {
        accessorKey: "createdAt",
        header: "Started",
        cell: ({ row }) => formatDate(row.original.createdAt)
      },
      {
        accessorKey: "nextDue",
        header: "Next due",
        cell: ({ row }) =>
          row.original.nextDue ? (
            formatDue(row.original.nextDue)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          return <Badge className={projectStatusClass[status]}>{projectStatusLabel[status]}</Badge>;
        }
      },
      {
        id: "progress",
        accessorFn: projectProgress,
        header: "Progress",
        cell: ({ row }) => {
          const value = projectProgress(row.original);
          return (
            <div className="flex flex-col lg:flex-row lg:items-center lg:gap-2">
              <Progress value={value} className="h-2" aria-label="Tasks done" />
              <span className="text-muted-foreground text-sm">{value}%</span>
            </div>
          );
        }
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const project = row.original;
          return (
            <div className="text-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <Ellipsis className="h-4 w-4" />
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
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 6
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent projects</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4">
          <Input
            placeholder="Filter projects..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columns <ChevronDownIcon className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {COLUMN_LABEL[column.id] ?? column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
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
        </div>
        <div className="flex items-center justify-end space-x-2 pt-4">
          <div className="text-muted-foreground flex-1 text-sm">
            {table.getFilteredRowModel().rows.length}{" "}
            {table.getFilteredRowModel().rows.length === 1 ? "project" : "projects"}
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

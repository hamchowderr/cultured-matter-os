"use client";

// Layout from the kit's apps/tasks/components/task-list.tsx (v2.0.0): one card with the
// search and filters along the top, the table, and the page controls along the bottom.
// Filters start from what the page asks for (open tasks, or one project, or what is due soon).

import * as React from "react";
import {
  type ColumnFiltersState,
  flexRender,
  type RowSelectionState,
  type SortingState,
  type ColumnVisibilityState as VisibilityState
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable as useReactTable
} from "@tanstack/react-table/legacy";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  SearchIcon,
  XIcon
} from "lucide-react";

import { revealTop } from "@/components/layout/list-transition";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import { projectIdsOf, type ProjectSummary, type TaskRow, type TaskStatus } from "../../types";
import { taskColumns } from "./columns";
import { dueBuckets, priorities, statuses } from "./data";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface DataTableProps {
  data: TaskRow[];
  projects: ProjectSummary[];
  initialFilters: ColumnFiltersState;
  onOpen: (task: TaskRow) => void;
  onStatusChange: (task: TaskRow, status: TaskStatus) => void;
}

export function DataTable({
  data,
  projects,
  initialFilters,
  onOpen,
  onStatusChange
}: DataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialFilters);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const columns = React.useMemo(
    () => taskColumns({ onOpen, onStatusChange }),
    [onOpen, onStatusChange]
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      rowSelection
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 25
      }
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  // Phones show the task, its priority and due date; select and status come back from 768px,
  // project from 992px.
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  React.useEffect(() => {
    setColumnVisibility((v) => ({
      ...v,
      select: !isMobile,
      status: !isMobile,
      project: !isTablet
    }));
  }, [isMobile, isTablet]);

  // A task linked into several projects counts once in each.
  const projectCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) {
      for (const id of projectIdsOf(row)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const openSelected = selected.filter((t) => t.status !== "done");
  const isFiltered = columnFilters.length > 0;
  const shown = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const firstRow = shown === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, shown);

  // A new page keeps the scroll position; bring the table's top back into view if it is above.
  const cardRef = React.useRef<HTMLDivElement>(null);
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    revealTop(cardRef.current);
  }, [pageIndex, pageSize]);

  function markSelectedDone() {
    for (const task of openSelected) onStatusChange(task, "done");
    table.resetRowSelection();
  }

  return (
    <Card ref={cardRef} className="scroll-mt-20">
      <CardContent className="flex flex-col p-0 [&_[data-slot=table-container]]:flex-1">
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-(--card-spacing) py-3">
          {selected.length > 0 ? (
            <>
              <span className="px-1 text-sm font-medium">{selected.length} selected</span>
              <Button
                variant="outline"
                size="sm"
                onClick={markSelectedDone}
                disabled={openSelected.length === 0}
              >
                <CheckIcon /> Mark done
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="ms-auto"
                onClick={() => table.resetRowSelection()}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="relative">
                <SearchIcon className="text-muted-foreground absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2" />
                <Input
                  placeholder="Search tasks..."
                  aria-label="Search tasks"
                  value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                  onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
                  className="h-7 w-40 ps-8 text-[0.8rem] lg:w-56"
                />
              </div>
              {table.getColumn("status") && (
                <DataTableFacetedFilter
                  column={table.getColumn("status")}
                  title="Status"
                  options={statuses}
                />
              )}
              {table.getColumn("priority") && (
                <DataTableFacetedFilter
                  column={table.getColumn("priority")}
                  title="Priority"
                  options={priorities}
                />
              )}
              {table.getColumn("project") && (
                <DataTableFacetedFilter
                  column={table.getColumn("project")}
                  title="Project"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  counts={projectCounts}
                />
              )}
              {table.getColumn("due") && (
                <DataTableFacetedFilter
                  column={table.getColumn("due")}
                  title="Due"
                  options={dueBuckets}
                />
              )}
              {isFiltered && (
                <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
                  Reset
                  <XIcon />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ms-auto">
                    <Columns3Icon />
                    <span className="hidden lg:inline">Columns</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {(column.columnDef.meta as { label?: string } | undefined)?.label ??
                          column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <Table className="[&_td:first-child]:ps-(--card-spacing) [&_td:last-child]:pe-(--card-spacing) [&_th:first-child]:ps-(--card-spacing) [&_th:last-child]:pe-(--card-spacing)">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
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
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                  {data.length ? "No tasks match these filters." : "No tasks yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t px-(--card-spacing) py-3 sm:flex-row">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            Rows per page
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-fit" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm tabular-nums">
              {firstRow} - {lastRow} of {shown}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Previous page</span>
                <ChevronLeftIcon />
              </Button>
              {Array.from({ length: pageCount }, (_, index) => (
                <Button
                  key={index}
                  variant={index === pageIndex ? "outline" : "ghost"}
                  size="icon-sm"
                  className="tabular-nums"
                  onClick={() => table.setPageIndex(index)}
                >
                  {index + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Next page</span>
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

// Ported from the kit's apps/tasks/components/data-table.tsx. Filters start from what the
// page asks for (open tasks, or one project, or what is due soon).

import * as React from "react";
import {
  type ColumnFiltersState,
  flexRender,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import type { ProjectSummary, TaskRow, TaskStatus } from "../../types";
import { taskColumns } from "./columns";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";

interface DataTableProps {
  data: TaskRow[];
  projects: ProjectSummary[];
  initialFilters: ColumnFiltersState;
  onOpen: (task: TaskRow) => void;
  onStatusChange: (task: TaskRow, status: TaskStatus) => void;
  onAdd: () => void;
}

export function DataTable({
  data,
  projects,
  initialFilters,
  onOpen,
  onStatusChange,
  onAdd
}: DataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialFilters);
  const [sorting, setSorting] = React.useState<SortingState>([]);
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
      columnFilters
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar table={table} projects={projects} onAdd={onAdd} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
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
                  {data.length ? "No tasks match these filters." : "No tasks yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

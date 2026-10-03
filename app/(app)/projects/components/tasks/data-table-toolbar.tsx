"use client";

// Ported from the kit's apps/tasks/components/data-table-toolbar.tsx: Status and Priority
// filters, plus Project and Due.

import {
  type LegacyReactTable as Table
} from "@tanstack/react-table/legacy";
import { PlusIcon, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectIdsOf, type ProjectSummary, type TaskRow } from "../../types";
import { dueBuckets, priorities, statuses } from "./data";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTableToolbarProps {
  table: Table<TaskRow>;
  projects: ProjectSummary[];
  onAdd: () => void;
}

export function DataTableToolbar({ table, projects, onAdd }: DataTableToolbarProps) {
  const isFiltered = table.getState().columnFilters.length > 0;

  // A task linked into several projects counts once in each.
  const projectCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of table.getCoreRowModel().rows) {
      for (const id of projectIdsOf(row.original)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [table.getCoreRowModel().rows]);

  return (
    <div className="flex flex-col justify-between gap-2 md:flex-row lg:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Filter tasks..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
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
          <DataTableFacetedFilter column={table.getColumn("due")} title="Due" options={dueBuckets} />
        )}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            Reset
            <X />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DataTableViewOptions table={table} />
        <Button size="sm" onClick={onAdd}>
          <PlusIcon />
          Add task
        </Button>
      </div>
    </div>
  );
}

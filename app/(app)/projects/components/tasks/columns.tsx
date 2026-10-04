"use client";

// Ported from the kit's apps/tasks/components/task-list.tsx columns (v2.0.0): a select box,
// then sortable headers. Labels are gone (tasks have none); project and due date take their place.

import { type LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { projectIdsOf, type TaskRow, type TaskStatus } from "../../types";
import { dueBucket, priorities, priorityRank, statuses } from "./data";
import { DataTableRowActions } from "./data-table-row-actions";
import { SortableHeader } from "./sortable-header";

const statusRank = Object.fromEntries(statuses.map((s, i) => [s.value, i]));

export function taskColumns({
  onOpen,
  onStatusChange
}: {
  onOpen: (task: TaskRow) => void;
  onStatusChange: (task: TaskRow, status: TaskStatus) => void;
}): ColumnDef<TaskRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select "${row.original.title}"`}
        />
      ),
      enableSorting: false,
      enableHiding: false
    },
    {
      accessorKey: "title",
      meta: { label: "Title" },
      header: ({ column }) => <SortableHeader column={column}>Task</SortableHeader>,
      cell: ({ row }) => {
        const task = row.original;
        const doneSubs = task.subtasks.filter((s) => s.status === "done").length;
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(task)}
              className={cn(
                "line-clamp-2 max-w-[500px] text-left font-medium whitespace-normal hover:underline lg:line-clamp-1",
                task.status === "done" && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </button>
            {task.subtasks.length > 0 && (
              <Badge variant="outline" className="shrink-0">
                {doneSubs}/{task.subtasks.length} subtasks
              </Badge>
            )}
          </div>
        );
      },
      enableHiding: false
    },
    {
      accessorKey: "status",
      meta: { label: "Status" },
      header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
      cell: ({ row }) => {
        const status = statuses.find((status) => status.value === row.getValue("status"));
        if (!status) return null;
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <status.icon className="text-muted-foreground size-4" />
            <span>{status.label}</span>
          </div>
        );
      },
      sortFn: (a, b) => statusRank[a.original.status] - statusRank[b.original.status],
      filterFn: (row, id, value) => value.includes(row.getValue(id))
    },
    {
      accessorKey: "priority",
      meta: { label: "Priority" },
      header: ({ column }) => <SortableHeader column={column}>Priority</SortableHeader>,
      cell: ({ row }) => {
        const priority = priorities.find((priority) => priority.value === row.getValue("priority"));
        if (!priority) return null;
        return (
          <div className="flex items-center gap-2">
            <priority.icon className="text-muted-foreground size-4" />
            <span className="max-sm:sr-only">{priority.label}</span>
          </div>
        );
      },
      // Low to urgent, not alphabetical.
      sortFn: (a, b) => priorityRank[a.original.priority] - priorityRank[b.original.priority],
      filterFn: (row, id, value) => value.includes(row.getValue(id))
    },
    {
      id: "project",
      accessorFn: (task) => task.projectName ?? "",
      meta: { label: "Project" },
      header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
      cell: ({ row }) => {
        const task = row.original;
        return (
          <div className="flex flex-col">
            <span className="whitespace-nowrap">{task.projectName ?? "No project"}</span>
            {task.alsoIn.length > 0 && (
              <span className="text-muted-foreground text-xs">
                Also in {task.alsoIn.map((p) => p.name).join(", ")}
              </span>
            )}
          </div>
        );
      },
      // A task matches a project it lives in or is linked into.
      filterFn: (row, _id, value: string[]) =>
        projectIdsOf(row.original).some((id) => value.includes(id))
    },
    {
      id: "due",
      accessorFn: (task) => dueBucket(task.dueDate),
      meta: { label: "Due" },
      header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
      cell: ({ row }) => {
        const task = row.original;
        if (!task.dueDate) return <span className="text-muted-foreground">—</span>;
        const late = task.status !== "done" && dueBucket(task.dueDate) === "overdue";
        return (
          <span
            className={cn("whitespace-normal md:whitespace-nowrap", late && "text-destructive")}
          >
            {formatDue(task.dueDate)}
          </span>
        );
      },
      // By date; tasks without one sort after dated tasks.
      sortFn: (a, b) => {
        const x = a.original.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const y = b.original.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return x === y ? 0 : x < y ? -1 : 1;
      },
      filterFn: (row, id, value) => value.includes(row.getValue(id))
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableRowActions
          task={row.original}
          onOpen={() => onOpen(row.original)}
          onStatusChange={(status) => onStatusChange(row.original, status)}
        />
      )
    }
  ];
}

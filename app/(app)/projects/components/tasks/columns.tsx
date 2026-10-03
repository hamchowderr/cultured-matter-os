"use client";

// Ported from the kit's apps/tasks/components/columns.tsx. Labels are gone (tasks have none);
// project and due date take their place.

import {
  type LegacyColumnDef as ColumnDef
} from "@tanstack/react-table/legacy";

import { Badge } from "@/components/ui/badge";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { projectIdsOf, type TaskRow, type TaskStatus } from "../../types";
import { dueBucket, priorities, priorityRank, statuses } from "./data";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";

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
      accessorKey: "title",
      meta: { label: "Title" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
      cell: ({ row }) => {
        const task = row.original;
        const doneSubs = task.subtasks.filter((s) => s.status === "done").length;
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(task)}
              className={cn(
                "max-w-[500px] truncate text-left font-medium hover:underline",
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
      cell: ({ row }) => {
        const priority = priorities.find((priority) => priority.value === row.getValue("priority"));
        if (!priority) return null;
        return (
          <div className="flex items-center gap-2">
            <priority.icon className="text-muted-foreground size-4" />
            <span>{priority.label}</span>
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Project" />,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => {
        const task = row.original;
        if (!task.dueDate) return <span className="text-muted-foreground">—</span>;
        const late = task.status !== "done" && dueBucket(task.dueDate) === "overdue";
        return (
          <span className={cn("whitespace-nowrap", late && "text-destructive")}>
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

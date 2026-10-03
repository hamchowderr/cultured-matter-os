import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type SortingState
} from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { taskColumns } from "@/app/(app)/projects/components/tasks/columns";
import type { TaskRow } from "@/app/(app)/projects/types";
import { taskFixture } from "@/components/cards/fixtures";

const row = (title: string, priority: TaskRow["priority"]): TaskRow => ({
  ...taskFixture,
  id: title,
  title,
  priority,
  projectName: null,
  business: null,
  alsoIn: [],
  subtasks: []
});

const data = [
  row("a", "medium"),
  row("b", "urgent"),
  row("c", "low"),
  row("d", "high"),
  row("e", "medium")
];

function titles(state: { sorting?: SortingState; columnFilters?: ColumnFiltersState }) {
  const table = createTable<TaskRow>({
    data,
    columns: taskColumns({ onOpen: () => {}, onStatusChange: () => {} }),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting: [], columnFilters: [], ...state },
    onStateChange: () => {},
    renderFallbackValue: null
  });
  return table.getRowModel().rows.map((r) => r.original.title);
}

describe("task table priority column", () => {
  it("filters by the chosen priorities", () => {
    expect(titles({ columnFilters: [{ id: "priority", value: ["high", "urgent"] }] })).toEqual([
      "b",
      "d"
    ]);
    expect(titles({ columnFilters: [{ id: "priority", value: ["medium"] }] })).toEqual(["a", "e"]);
  });

  it("sorts low to urgent, not alphabetically", () => {
    expect(titles({ sorting: [{ id: "priority", desc: false }] })).toEqual([
      "c",
      "a",
      "e",
      "d",
      "b"
    ]);
    expect(titles({ sorting: [{ id: "priority", desc: true }] })[0]).toBe("b");
  });
});

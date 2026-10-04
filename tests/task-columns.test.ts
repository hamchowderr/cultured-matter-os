import {
  aggregationFns,
  constructTable,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
  stockFeatures,
  type ColumnFiltersState,
  type SortingState
} from "@tanstack/react-table";
import type { LegacyFeatures } from "@tanstack/react-table/legacy";
import { storeReactivityBindings } from "@tanstack/table-core/store-reactivity-bindings";
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
  // The same features the app's useLegacyTable builds when filtering and sorting are on,
  // with TanStack Store reactivity in place of React's (no component renders here).
  const features = {
    coreReactivityFeature: storeReactivityBindings(),
    ...stockFeatures,
    filterFns,
    sortFns,
    aggregationFns,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel()
  } as LegacyFeatures;
  const table = constructTable<LegacyFeatures, TaskRow>({
    features,
    data,
    columns: taskColumns({ onOpen: () => {}, onStatusChange: () => {} }),
    state: { sorting: [], columnFilters: [], ...state }
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

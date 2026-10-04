import { create } from "zustand";

import type { listCaptures } from "@/actions/server";

export type Capture = Extract<
  Awaited<ReturnType<typeof listCaptures>>,
  { ok: true }
>["data"]["captures"][number];
export type Kind = "task" | "idea" | "reference";
export type Project = { id: string; name: string; business: string };

export const KIND_LABEL: Record<Kind, string> = {
  task: "Task",
  idea: "Idea",
  reference: "Reference"
};

// Ported from the kit's mail store: which capture the reading pane shows.
type InboxStore = {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
};

export const useInboxStore = create<InboxStore>((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id })
}));

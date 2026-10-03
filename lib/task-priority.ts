// Task priorities with the kit's apps/tasks icons (ArrowDown, ArrowRight, ArrowUp). The kit stops
// at High; Urgent adds ChevronsUp in the same arrow family.
import { ArrowDown, ArrowRight, ArrowUp, ChevronsUp } from "lucide-react";

import type { Task } from "@/actions/schemas";

export type TaskPriority = Task["priority"];

export const priorities: {
  value: TaskPriority;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "low", label: "Low", icon: ArrowDown },
  { value: "medium", label: "Medium", icon: ArrowRight },
  { value: "high", label: "High", icon: ArrowUp },
  { value: "urgent", label: "Urgent", icon: ChevronsUp }
];

export const priorityRank: Record<TaskPriority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

// Ported from the kit's apps/tasks/data/data.tsx, with this app's statuses and due-date groups.
import {
  CalendarClock,
  CalendarDays,
  CalendarX,
  CheckCircle,
  Circle,
  CircleAlert,
  Hourglass,
  Reply,
  Sun,
  Timer
} from "lucide-react";

import { daysUntil } from "@/lib/format";
import type { TaskStatus } from "../../types";

export const statuses: {
  value: TaskStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "todo", label: "To do", icon: Circle },
  { value: "in_progress", label: "In progress", icon: Timer },
  { value: "waiting", label: "Waiting for response", icon: Hourglass },
  { value: "replied", label: "Replied", icon: Reply },
  { value: "done", label: "Done", icon: CheckCircle }
];

export const openStatuses = statuses.filter((s) => s.value !== "done").map((s) => s.value);

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export const dueBuckets: {
  value: DueBucket;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "overdue", label: "Overdue", icon: CircleAlert },
  { value: "today", label: "Due today", icon: Sun },
  { value: "week", label: "Next 7 days", icon: CalendarDays },
  { value: "later", label: "Later", icon: CalendarClock },
  { value: "none", label: "No due date", icon: CalendarX }
];

export function dueBucket(due: Date | null, now = new Date()): DueBucket {
  if (!due) return "none";
  const days = daysUntil(due, now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

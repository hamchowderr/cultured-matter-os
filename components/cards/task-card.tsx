"use client";

import type { Task } from "@/actions/schemas";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { daysUntil, formatDue } from "@/lib/format";
import { priorities } from "@/lib/task-priority";
import { cn } from "@/lib/utils";

type TaskStatus = Task["status"];

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting for response",
  replied: "Replied",
  done: "Done"
};

export type TaskCardProps = {
  task: Task;
  projectName?: string;
  subtaskCount?: number;
  onStatusChange?: (status: TaskStatus) => void;
  onOpen?: () => void;
  now?: Date;
  className?: string;
};

export function TaskCard({
  task,
  projectName,
  subtaskCount,
  onStatusChange,
  onOpen,
  now = new Date(),
  className
}: TaskCardProps) {
  const done = task.status === "done";
  const overdue = !done && task.dueDate != null && daysUntil(task.dueDate, now) < 0;
  // Only high and urgent are shown; low and medium would be noise on every card.
  const priority =
    task.priority === "high" || task.priority === "urgent"
      ? priorities.find((p) => p.value === task.priority)
      : undefined;

  return (
    <article className={cn("bg-muted/40 flex items-start gap-3 rounded-lg p-4", className)}>
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={!onStatusChange}
        onCheckedChange={(checked) => onStatusChange?.(checked ? "done" : "todo")}
        aria-label={done ? "Mark as not done" : "Mark as done"}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className={cn("font-medium", done && "text-muted-foreground line-through")}>
          {onOpen ? (
            <button type="button" onClick={onOpen} className="text-left hover:underline">
              {task.title}
            </button>
          ) : (
            task.title
          )}
        </h3>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {priority && (
            <span className="inline-flex items-center gap-1">
              <priority.icon className="size-3.5" />
              {priority.label}
            </span>
          )}
          {projectName && <span>{projectName}</span>}
          {task.dueDate && (
            <span className={cn(overdue && "text-destructive font-medium")}>
              {formatDue(task.dueDate, now)}
            </span>
          )}
          {subtaskCount != null && subtaskCount > 0 && (
            <span>
              {subtaskCount} subtask{subtaskCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {onStatusChange ? (
        <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
          <SelectTrigger size="sm" className="w-48 shrink-0" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(taskStatusLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="secondary">{taskStatusLabel[task.status]}</Badge>
      )}
    </article>
  );
}

"use client";

// Ported from the kit's project-management/components/reminders.tsx (v2.0.0): the reminders are the
// open tasks that are overdue or due in the next week. The check marks a task done.
// The "Due this week" card above carries the counts; this card shows the tasks themselves.

import { ArrowRight, CircleCheck, PlusCircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DueTask, DueTasks } from "../types";

type Level = "overdue" | "today" | "week";

const LEVEL_LABEL: Record<Level, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week"
};

const SHOWN = 3;

export function Reminders({
  due,
  onOpen,
  onDone,
  onAdd,
  onShowAll
}: {
  due: DueTasks;
  onOpen: (task: DueTask) => void;
  onDone: (task: DueTask) => void;
  onAdd: () => void;
  onShowAll: () => void;
}) {
  const reminders = [
    ...due.overdue.map((task) => ({ task, level: "overdue" as const })),
    ...due.today.map((task) => ({ task, level: "today" as const })),
    ...due.week.map((task) => ({ task, level: "week" as const }))
  ];
  const rest = reminders.length - SHOWN;

  return (
    <Card className="xl:col-span-2" data-tour-step-id="projects-reminders">
      <CardHeader>
        <CardTitle>Next up</CardTitle>
        <CardDescription>Most urgent first. Tick a task to mark it done.</CardDescription>
        <CardAction>
          <Button variant="outline" onClick={onAdd}>
            <PlusCircleIcon />
            Add task
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            Nothing is overdue or due in the next week.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {reminders.slice(0, SHOWN).map(({ task, level }) => (
              <div key={task.id} className="bg-muted/50 space-y-3 rounded-lg p-4">
                <div className="flex items-center text-sm font-semibold">
                  <span
                    className={cn("me-2 size-2 rounded-full", {
                      "bg-gray-400": level === "week",
                      "bg-orange-400": level === "today",
                      "bg-red-600": level === "overdue"
                    })}
                  ></span>
                  {LEVEL_LABEL[level]}
                  <button
                    type="button"
                    onClick={() => onDone(task)}
                    className="ms-auto rounded-full"
                    aria-label={`Mark "${task.title}" done`}
                  >
                    <CircleCheck className="size-4 text-gray-400 hover:text-green-600" />
                  </button>
                </div>
                <div
                  className={cn(
                    "text-muted-foreground text-sm",
                    level === "overdue" && "text-red-600"
                  )}
                >
                  {task.dueDate ? formatDue(task.dueDate) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className="block text-left text-sm hover:underline"
                >
                  {task.title}
                </button>
                <Badge variant="outline">{task.projectName ?? "No project"}</Badge>
              </div>
            ))}
          </div>
        )}
        {rest > 0 && (
          <div className="mt-4 text-end">
            <Button
              variant="link"
              className="text-muted-foreground hover:text-primary"
              onClick={onShowAll}
            >
              See every task due soon <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

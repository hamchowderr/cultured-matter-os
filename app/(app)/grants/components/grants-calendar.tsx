"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import type { Grant, Task } from "@/actions/schemas";
import { cn } from "@/lib/utils";
import { EventCalendar, type CalendarEvent, type EventColor } from "../calendar/components";
import { getEventColorClasses } from "../calendar/utils";

export type CalendarTask = Task & { projectName: string | null };

const legend: { label: string; color: EventColor }[] = [
  { label: "Found", color: "sky" },
  { label: "Watching", color: "emerald" },
  { label: "Applying", color: "amber" },
  { label: "Submitted", color: "violet" },
  { label: "Passed", color: "rose" },
  { label: "Task due", color: "orange" }
];

const grantColor: Record<NonNullable<Grant["status"]> | "new", EventColor> = {
  new: "sky",
  watching: "emerald",
  applying: "amber",
  submitted: "violet",
  passed: "rose"
};

/** Grant deadlines and task due dates on the kit's event calendar. Click a grant to open it. */
export function GrantsCalendar({
  grants,
  tasks,
  onOpenGrant
}: {
  grants: Grant[];
  tasks: CalendarTask[];
  onOpenGrant: (grant: Grant) => void;
}) {
  const router = useRouter();

  const events = useMemo<CalendarEvent[]>(
    () => [
      // Rolling grants have no deadline, so they stay off the calendar.
      ...grants
        .filter((g) => g.deadline)
        .map((g) => ({
          id: `grant:${g.id}`,
          title: g.title,
          description: g.agency ?? undefined,
          start: g.deadline!,
          end: g.deadline!,
          allDay: true,
          color: grantColor[g.status ?? "new"]
        })),
      ...tasks
        .filter((t) => t.dueDate)
        .map((t) => ({
          id: `task:${t.id}`,
          title: t.title,
          description: t.projectName ?? undefined,
          start: t.dueDate!,
          end: t.dueDate!,
          allDay: true,
          color: "orange" as const
        }))
    ],
    [grants, tasks]
  );

  function select(event: CalendarEvent) {
    const [kind, id] = event.id.split(":");
    if (kind === "grant") {
      const grant = grants.find((g) => g.id === id);
      if (grant) onOpenGrant(grant);
      return;
    }
    const task = tasks.find((t) => t.id === id);
    router.push(task?.projectId ? `/projects?p=${task.projectId}` : "/today");
  }

  return (
    <EventCalendar
      events={events}
      onEventSelect={select}
      toolbar={
        <ul className="hidden items-center gap-1.5 lg:flex" aria-label="Legend">
          {legend.map((l) => (
            <li
              key={l.label}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                getEventColorClasses(l.color)
              )}
            >
              {l.label}
            </li>
          ))}
        </ul>
      }
    />
  );
}

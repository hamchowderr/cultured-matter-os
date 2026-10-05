"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { dueTasks, setTaskStatus } from "@/actions/server";
import { TaskCard } from "@/components/cards";
import { cn } from "@/lib/utils";

type Groups = Extract<Awaited<ReturnType<typeof dueTasks>>, { ok: true }>["data"];
type DueTask = Groups["today"][number];

const LABELS: { key: keyof Groups; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "week", label: "Next 7 days" }
];

// With the switch on All, personal tasks say so next to their project name.
const projectLabel = (t: DueTask, labelPersonal: boolean) =>
  labelPersonal && t.personal
    ? ["Personal", t.projectName].filter(Boolean).join(" · ")
    : (t.projectName ?? undefined);

export function TodayTasks({
  groups,
  labelPersonal = false
}: {
  groups: Groups;
  labelPersonal?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  // The action refreshes the page itself (actions/define.ts toResult), so the new lists arrive
  // with its response.
  function change(task: DueTask, status: DueTask["status"]) {
    startTransition(async () => {
      const result = await setTaskStatus({ taskId: task.id, status });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (status === "done") toast.success(`Done: ${task.title}`);
    });
  }

  return (
    <div className={cn("space-y-5 transition-opacity", pending && "opacity-70")}>
      {LABELS.filter(({ key }) => groups[key].length > 0).map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <h3 className={cn("text-sm font-medium", key === "overdue" && "text-destructive")}>
            {label}
          </h3>
          {groups[key].map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              projectName={projectLabel(t, labelPersonal)}
              onStatusChange={(s) => change(t, s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

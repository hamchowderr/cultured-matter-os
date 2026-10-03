"use client";

import { useRouter } from "next/navigation";
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

export function TodayTasks({ groups }: { groups: Groups }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function change(task: DueTask, status: DueTask["status"]) {
    const result = await setTaskStatus({ taskId: task.id, status });
    if (!result.ok) return toast.error(result.error.message);
    if (status === "done") toast.success(`Done: ${task.title}`);
    startTransition(() => router.refresh());
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
              projectName={t.projectName ?? undefined}
              onStatusChange={(s) => change(t, s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

"use client";

import { MailIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createTask,
  linkTaskToProject,
  setTaskStatus,
  unlinkTaskFromProject,
  updateTask
} from "@/actions/server";
import { taskStatusLabel } from "@/components/cards";
import { FollowUpDialog } from "@/components/outlook/follow-up-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fromDateInput, type ProjectSummary, type ProjectTask } from "./types";

const toDateInput = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : "";

export function TaskSheet({
  task,
  projects,
  currentProjectId,
  onClose,
  onChanged
}: {
  task: ProjectTask | null;
  projects: ProjectSummary[];
  currentProjectId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [subtask, setSubtask] = useState("");
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
  }, [task?.id]);

  async function save(patch: Parameters<typeof updateTask>[0], done?: string) {
    const result = await updateTask(patch);
    if (!result.ok) return toast.error(result.error.message);
    if (done) toast.success(done);
    onChanged();
  }

  async function call(fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    const result = await fn();
    if (!result.ok) return toast.error(result.error?.message ?? "Something went wrong");
    onChanged();
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !subtask.trim()) return;
    await call(() =>
      createTask({
        title: subtask.trim(),
        parentTaskId: task.id,
        projectId: task.projectId ?? undefined
      })
    );
    setSubtask("");
  }

  const homeId = task?.projectId ?? null;
  const shownIn = new Set([homeId, ...(task?.alsoIn.map((p) => p.id) ?? [])]);
  const linkable = projects.filter((p) => !shownIn.has(p.id));

  return (
    <Sheet open={!!task} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {task && (
          <div className="space-y-6 px-4 pb-6">
            <SheetHeader className="px-0">
              <SheetTitle className="sr-only">Edit task</SheetTitle>
              <SheetDescription className="sr-only">
                Title, notes, due date, subtasks and projects.
              </SheetDescription>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() =>
                  title.trim() &&
                  title !== task.title &&
                  save({ taskId: task.id, title: title.trim() })
                }
                className="h-10 text-lg font-semibold"
                aria-label="Title"
              />
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-status">Status</Label>
                <NativeSelect
                  id="task-status"
                  size="sm"
                  value={task.status}
                  onChange={(e) =>
                    call(() =>
                      setTaskStatus({
                        taskId: task.id,
                        status: e.target.value as ProjectTask["status"]
                      })
                    )
                  }
                >
                  {Object.entries(taskStatusLabel).map(([v, l]) => (
                    <NativeSelectOption key={v} value={v}>
                      {l}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due</Label>
                <Input
                  id="task-due"
                  type="date"
                  className="h-8"
                  value={toDateInput(task.dueDate)}
                  onChange={(e) =>
                    save({ taskId: task.id, dueDate: fromDateInput(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() =>
                  notes !== (task.notes ?? "") &&
                  save({ taskId: task.id, notes: notes.trim() || null })
                }
                placeholder="Anything worth remembering"
              />
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Follow-up email</h3>
              <p className="text-muted-foreground text-sm">
                {task.emailThreadId
                  ? task.status === "waiting"
                    ? "Saved in your Gmail Drafts. Once you send it, the task moves to Replied when they write back."
                    : "A follow-up for this task was saved in your Gmail Drafts."
                  : "Write an email for this task. After you approve it, it waits in your Gmail Drafts."}
              </p>
              <Button size="sm" variant="outline" onClick={() => setDrafting(true)}>
                <MailIcon />
                Draft follow-up
              </Button>
              <FollowUpDialog
                open={drafting}
                onOpenChange={setDrafting}
                taskId={task.id}
                defaultSubject={task.title}
                onQueued={onChanged}
              />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Subtasks</h3>
              {task.subtasks.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={s.status === "done"}
                    onCheckedChange={(on) =>
                      call(() => setTaskStatus({ taskId: s.id, status: on ? "done" : "todo" }))
                    }
                  />
                  <span className={s.status === "done" ? "text-muted-foreground line-through" : ""}>
                    {s.title}
                  </span>
                </label>
              ))}
              <form onSubmit={addSubtask} className="flex gap-2">
                <Input
                  value={subtask}
                  onChange={(e) => setSubtask(e.target.value)}
                  placeholder="Add a subtask"
                  className="h-8"
                  aria-label="New subtask"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!subtask.trim()}>
                  Add
                </Button>
              </form>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Projects</h3>
              <ul className="space-y-1 text-sm">
                <li>
                  {projects.find((p) => p.id === homeId)?.name ?? "No project"}
                  <span className="text-muted-foreground"> · home</span>
                </li>
                {task.alsoIn
                  .filter((p) => p.id !== homeId)
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      {p.name}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={`Remove from ${p.name}`}
                        onClick={() =>
                          call(() => unlinkTaskFromProject({ taskId: task.id, projectId: p.id }))
                        }
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                {task.linked && currentProjectId && (
                  <li className="flex items-center justify-between">
                    {projects.find((p) => p.id === currentProjectId)?.name}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Remove from this project"
                      onClick={async () => {
                        await call(() =>
                          unlinkTaskFromProject({ taskId: task.id, projectId: currentProjectId })
                        );
                        onClose();
                      }}
                    >
                      <XIcon />
                    </Button>
                  </li>
                )}
              </ul>
              {linkable.length > 0 && (
                <NativeSelect
                  size="sm"
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    call(() => linkTaskToProject({ taskId: task.id, projectId: e.target.value }))
                  }
                  aria-label="Also show in project"
                >
                  <NativeSelectOption value="">Also show in…</NativeSelectOption>
                  {linkable.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.business} / {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

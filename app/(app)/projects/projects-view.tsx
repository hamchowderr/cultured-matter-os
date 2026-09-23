"use client";

import { FolderKanbanIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createProject,
  createTask,
  getProject,
  listProjects,
  setTaskStatus,
  updateProject
} from "@/actions/server";
import { TaskCard } from "@/components/cards";
import { ComingSoon } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TaskSheet } from "./task-sheet";

export type ProjectSummary = Extract<
  Awaited<ReturnType<typeof listProjects>>,
  { ok: true }
>["data"]["projects"][number];
export type ProjectDetail = Extract<Awaited<ReturnType<typeof getProject>>, { ok: true }>["data"];
export type ProjectTask = ProjectDetail["tasks"][number];

// "2026-09-30" from a date input → that day at local noon.
export function fromDateInput(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

export function ProjectsView({
  projects,
  selected,
  showDone
}: {
  projects: ProjectSummary[];
  selected: ProjectDetail | null;
  showDone: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const refresh = () => startTransition(() => router.refresh());

  const businesses = [...new Set(projects.map((p) => p.business))];
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/projects?${next.toString()}`;
  };

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !title.trim()) return;
    const result = await createTask({
      title: title.trim(),
      projectId: selected.project.id,
      dueDate: fromDateInput(due) ?? undefined
    });
    if (!result.ok) return toast.error(result.error.message);
    setTitle("");
    setDue("");
    refresh();
  }

  async function changeStatus(task: ProjectTask, status: ProjectTask["status"]) {
    const result = await setTaskStatus({ taskId: task.id, status });
    if (!result.ok) return toast.error(result.error.message);
    refresh();
  }

  async function setProjectStatus(status: "active" | "paused" | "done") {
    if (!selected) return;
    const result = await updateProject({ projectId: selected.project.id, status });
    if (!result.ok) return toast.error(result.error.message);
    toast.success(`Marked ${selected.project.name} ${status}`);
    refresh();
  }

  const openTask = selected?.tasks.find((t) => t.id === openTaskId) ?? null;

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[16rem_1fr]", pending && "opacity-80")}>
      <aside className="space-y-4">
        <Button size="sm" className="w-full" onClick={() => setNewOpen(true)}>
          <PlusIcon />
          New project
        </Button>
        {businesses.map((b) => (
          <nav key={b} className="space-y-1" aria-label={b}>
            <h2 className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
              {b}
            </h2>
            {projects
              .filter((p) => p.business === b)
              .map((p) => (
                <Link
                  key={p.id}
                  href={href({ p: p.id })}
                  scroll={false}
                  className={cn(
                    "hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                    selected?.project.id === p.id && "bg-accent font-medium"
                  )}
                >
                  <span
                    className={cn("truncate", p.status !== "active" && "text-muted-foreground")}
                  >
                    {p.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {p.overdue > 0 && (
                      <Badge variant="destructive" className="px-1.5">
                        {p.overdue}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs tabular-nums">{p.open}</span>
                  </span>
                </Link>
              ))}
          </nav>
        ))}
        <Link
          href={href({ done: showDone ? undefined : "1" })}
          className="text-muted-foreground block px-2 text-xs hover:underline"
        >
          {showDone ? "Hide finished projects" : "Show finished projects"}
        </Link>
      </aside>

      <main className="min-w-0 space-y-4">
        {!selected ? (
          <ComingSoon
            icon={FolderKanbanIcon}
            title="No projects yet"
            description="Create a project to start adding tasks. Tasks filed from the Inbox land here too."
          />
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">{selected.project.business}</p>
                <h2 className="text-xl font-semibold">{selected.project.name}</h2>
                {selected.project.description && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {selected.project.description}
                  </p>
                )}
              </div>
              <NativeSelect
                size="sm"
                className="w-auto"
                value={selected.project.status}
                onChange={(e) => setProjectStatus(e.target.value as "active" | "paused" | "done")}
                aria-label="Project status"
              >
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="paused">Paused</NativeSelectOption>
                <NativeSelectOption value="done">Finished</NativeSelectOption>
              </NativeSelect>
            </header>

            <form onSubmit={addTask} className="flex flex-wrap gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a task and press Enter"
                className="h-9 min-w-60 flex-1"
                aria-label="New task"
              />
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="h-9 w-40"
                aria-label="Due date"
              />
              <Button type="submit" size="sm" className="h-9" disabled={!title.trim()}>
                Add
              </Button>
            </form>

            {selected.tasks.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                No tasks in this project yet.
              </p>
            ) : (
              <div className="space-y-2">
                {selected.tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    projectName={
                      t.linked
                        ? `From ${t.alsoIn[0]?.name ?? "another project"}`
                        : t.alsoIn.length
                          ? `Also in ${t.alsoIn.map((p) => p.name).join(", ")}`
                          : undefined
                    }
                    subtaskCount={t.subtasks.length}
                    onStatusChange={(s) => changeStatus(t, s)}
                    onOpen={() => setOpenTaskId(t.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        businesses={businesses.length ? businesses : ["Cultured Matter"]}
        onCreated={(id) => {
          setNewOpen(false);
          startTransition(() => router.push(href({ p: id })));
        }}
      />

      <TaskSheet
        task={openTask}
        projects={projects}
        currentProjectId={selected?.project.id ?? null}
        onClose={() => setOpenTaskId(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
  businesses,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businesses: string[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState(businesses[0]);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const result = await createProject({
      name: name.trim(),
      business: business.trim() || undefined
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    setName("");
    toast.success(`Created ${result.data.name}`);
    onCreated(result.data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Projects sit under a business. Type a new business name to add one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-business">Business</Label>
            <Input
              id="project-business"
              list="businesses"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
            />
            <datalist id="businesses">
              {businesses.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

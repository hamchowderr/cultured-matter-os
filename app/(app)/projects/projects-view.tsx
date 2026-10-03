"use client";

// Layout from the kit's project-management page: a header row, then Overview / Projects /
// Tasks tabs. Overview holds the summary cards, reminders, chart and recent projects; Projects
// is the kit's project list; Tasks is the kit's tasks data table.

import { type ColumnFiltersState } from "@tanstack/react-table";
import { FolderKanbanIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { setTaskStatus, updateProject } from "@/actions/server";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActivityPoint, ProjectStats } from "@/lib/project-stats";
import { cn } from "@/lib/utils";
import { AddTaskDialog } from "./components/add-task-dialog";
import { ChartProjectOverview } from "./components/chart-project-overview";
import { NewProjectDialog } from "./components/new-project-dialog";
import { ProjectList } from "./components/project-list";
import { Reminders } from "./components/reminders";
import { SummaryCards } from "./components/summary-cards";
import { TableRecentProjects, type ProjectStatus } from "./components/table-recent-projects";
import { openStatuses } from "./components/tasks/data";
import { DataTable } from "./components/tasks/data-table";
import { TaskSheet } from "./task-sheet";
import {
  projectIdsOf,
  toSheetTask,
  type DueTask,
  type DueTasks,
  type ProjectSummary,
  type TaskRow,
  type TaskStatus
} from "./types";

export type View = "overview" | "projects" | "tasks";

export function ProjectsView({
  view,
  projectId,
  dueSoon,
  showDone,
  projects,
  tasks,
  due,
  stats,
  activity
}: {
  view: View;
  projectId: string | null;
  dueSoon: boolean;
  showDone: boolean;
  projects: ProjectSummary[];
  tasks: TaskRow[];
  due: DueTasks;
  stats: ProjectStats;
  activity: ActivityPoint[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };
  const go = (patch: Record<string, string | undefined>) =>
    startTransition(() => router.push(href(patch), { scroll: false }));

  const current = projects.find((p) => p.id === projectId) ?? null;
  const openProjects = projects.filter((p) => p.status !== "done");
  const listed = showDone ? projects : openProjects;
  const businesses = [...new Set(projects.map((p) => p.business))];

  // Earliest due date among each project's open tasks, counting tasks linked in.
  const nextDue = useMemo(() => {
    const map = new Map<string, Date>();
    for (const t of tasks) {
      if (t.status === "done" || !t.dueDate) continue;
      for (const id of projectIdsOf(t)) {
        const seen = map.get(id);
        if (!seen || t.dueDate < seen) map.set(id, t.dueDate);
      }
    }
    return map;
  }, [tasks]);

  const initialFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [{ id: "status", value: openStatuses }];
    if (projectId) filters.push({ id: "project", value: [projectId] });
    if (dueSoon) filters.push({ id: "due", value: ["overdue", "today", "week"] });
    return filters;
  }, [projectId, dueSoon]);

  const openTask = useCallback((task: { id: string }) => setOpenTaskId(task.id), []);
  const changeStatus = useCallback(
    async (task: { id: string; title: string }, status: TaskStatus) => {
      const result = await setTaskStatus({ taskId: task.id, status });
      if (!result.ok) return toast.error(result.error.message);
      if (status === "done") toast.success(`Marked "${task.title}" done`);
      refresh();
    },
    [refresh]
  );
  const setProjectStatus = useCallback(
    async (project: ProjectSummary, status: ProjectStatus) => {
      const result = await updateProject({ projectId: project.id, status });
      if (!result.ok) return toast.error(result.error.message);
      toast.success(`Marked ${project.name} ${status === "done" ? "finished" : status}`);
      refresh();
    },
    [refresh]
  );
  const showProject = useCallback(
    (id: string) => go({ view: "tasks", p: id, due: undefined }),
    [params]
  );

  // A reminder can be a subtask; the sheet opens on its parent.
  const openReminder = (task: DueTask) => setOpenTaskId(task.parentTaskId ?? task.id);

  const sheetRow = tasks.find((t) => t.id === openTaskId) ?? null;

  return (
    <div className={cn("space-y-4", pending && "opacity-80")}>
      <div className="mb-4 flex flex-row flex-wrap items-center justify-between gap-2 space-y-2">
        <PageHeader
          title="Projects"
          description="Businesses, their projects, and the tasks in each. A task can show up in more than one project."
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setNewProjectOpen(true)}>
            <PlusIcon />
            New project
          </Button>
          <Button onClick={() => setAddOpen(true)} disabled={openProjects.length === 0}>
            <PlusIcon />
            Add task
          </Button>
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) =>
          go({ view: v === "overview" ? undefined : v, p: undefined, due: undefined })
        }
        className="space-y-4"
      >
        <TabsList className="z-10">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {projects.length === 0 ? (
            <NoProjects />
          ) : (
            <>
              <SummaryCards stats={stats} />
              <Reminders
                due={due}
                onOpen={openReminder}
                onDone={(task) => changeStatus(task, "done")}
                onAdd={() => setAddOpen(true)}
                onShowAll={() => go({ view: "tasks", p: undefined, due: "soon" })}
              />
              <ChartProjectOverview data={activity} />
              <TableRecentProjects
                projects={projects}
                nextDue={nextDue}
                onOpen={showProject}
                onSetStatus={setProjectStatus}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          {listed.length === 0 ? (
            <NoProjects />
          ) : (
            <ProjectList projects={listed} nextDue={nextDue} onOpen={showProject} />
          )}
          {projects.length > openProjects.length && (
            <Link
              href={href({ done: showDone ? undefined : "1" })}
              scroll={false}
              className="text-muted-foreground block text-sm hover:underline"
            >
              {showDone ? "Hide finished projects" : "Show finished projects"}
            </Link>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          {current && (
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="text-muted-foreground text-xs">{current.business}</p>
                <h2 className="text-xl font-semibold">{current.name}</h2>
                {current.description && (
                  <p className="text-muted-foreground mt-1 text-sm">{current.description}</p>
                )}
                <Link
                  href={href({ p: undefined })}
                  scroll={false}
                  className="text-muted-foreground mt-2 inline-block text-xs hover:underline"
                >
                  Show tasks from all projects
                </Link>
              </div>
              <NativeSelect
                size="sm"
                className="w-auto"
                value={current.status}
                onChange={(e) => setProjectStatus(current, e.target.value as ProjectStatus)}
                aria-label="Project status"
              >
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="paused">Paused</NativeSelectOption>
                <NativeSelectOption value="done">Finished</NativeSelectOption>
              </NativeSelect>
            </header>
          )}
          <DataTable
            key={`${projectId ?? "all"}-${dueSoon}`}
            data={tasks}
            projects={
              current && current.status === "done" ? [...openProjects, current] : openProjects
            }
            initialFilters={initialFilters}
            onOpen={openTask}
            onStatusChange={changeStatus}
            onAdd={() => setAddOpen(true)}
          />
        </TabsContent>
      </Tabs>

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={openProjects}
        defaultProjectId={current && current.status !== "done" ? current.id : null}
        onCreated={refresh}
      />

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        businesses={businesses.length ? businesses : ["Cultured Matter"]}
        onCreated={(id) => {
          setNewProjectOpen(false);
          showProject(id);
        }}
      />

      <TaskSheet
        task={sheetRow ? toSheetTask(sheetRow, view === "tasks" ? projectId : null) : null}
        projects={projects}
        currentProjectId={view === "tasks" ? projectId : null}
        onClose={() => setOpenTaskId(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function NoProjects() {
  return (
    <ComingSoon
      icon={FolderKanbanIcon}
      title="No projects yet"
      description="Create a project to start adding tasks. Tasks filed from the Inbox land here too."
    />
  );
}

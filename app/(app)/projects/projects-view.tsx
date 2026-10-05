"use client";

// Layout from the kit's project-management page (v2.0.0): a header row, then Overview / Projects /
// Tasks tabs. Overview holds the summary cards, reminders, chart and recent projects; Projects
// is the kit's project list; Tasks is the kit's tasks data table.

import { type ColumnFiltersState } from "@tanstack/react-table";
import { FolderKanbanIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteProject, setTaskStatus, updateProject } from "@/actions/server";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";
import { ScopeSwitch } from "@/components/layout/scope-switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPersonal, PERSONAL_BUSINESS, type WorkScope } from "@/lib/personal";
import type { ActivityPoint, ProjectStats } from "@/lib/project-stats";
import { cn } from "@/lib/utils";
import { AddTaskDrawer } from "./components/add-task-drawer";
import { ChartProjectOverview } from "./components/chart-project-overview";
import { NewProjectDrawer } from "./components/new-project-drawer";
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
  scope,
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
  // The Business / Personal / All switch; the server already narrowed the data to it.
  scope: WorkScope;
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
  // Choices for a new project's business: Personal first on the Personal side, offered last
  // on All, left out on Business.
  const existing = [...new Set(projects.map((p) => p.business))].filter((b) => !isPersonal(b));
  const businesses =
    scope === "personal"
      ? [PERSONAL_BUSINESS]
      : scope === "business"
        ? existing.length
          ? existing
          : ["Cultured Matter"]
        : [...(existing.length ? existing : ["Cultured Matter"]), PERSONAL_BUSINESS];

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
  // Saves refresh the page from the server action itself (actions/define.ts toResult); the
  // transition keeps the page dimmed until the new data is on screen.
  const changeStatus = useCallback((task: { id: string; title: string }, status: TaskStatus) => {
    startTransition(async () => {
      const result = await setTaskStatus({ taskId: task.id, status });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (status === "done") toast.success(`Marked "${task.title}" done`);
    });
  }, []);
  const setProjectStatus = useCallback((project: ProjectSummary, status: ProjectStatus) => {
    startTransition(async () => {
      const result = await updateProject({ projectId: project.id, status });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Marked ${project.name} ${status === "done" ? "finished" : status}`);
    });
  }, []);
  const removeProject = useCallback(
    async (project: ProjectSummary) => {
      const result = await deleteProject({ projectId: project.id });
      if (!result.ok) return toast.error(result.error.message);
      toast.success(`Deleted ${project.name}`);
      go({ view: "projects", p: undefined, due: undefined });
    },
    [params]
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
          tourId="projects-heading"
          description="Businesses, their projects, and the tasks in each. A task can show up in more than one project."
        />
        <div className="flex items-center gap-2" data-tour-step-id="projects-add">
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
        className="space-y-4 lg:space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="z-10" data-tour-step-id="projects-tabs">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>
          <ScopeSwitch
            scope={scope}
            tourId="projects-scope"
            // A project from the other side would keep the page on All; drop it.
            onChanged={() => router.push(href({ p: undefined }), { scroll: false })}
          />
        </div>

        <TabsContent value="overview" className="space-y-4 lg:space-y-6">
          {projects.length === 0 ? (
            <NoProjects />
          ) : (
            <>
              <SummaryCards stats={stats} />
              <ChartProjectOverview data={activity} />
              <Reminders
                due={due}
                onOpen={openReminder}
                onDone={(task) => changeStatus(task, "done")}
                onAdd={() => setAddOpen(true)}
                onShowAll={() => go({ view: "tasks", p: undefined, due: "soon" })}
              />
              <TableRecentProjects
                projects={projects}
                nextDue={nextDue}
                onOpen={showProject}
                onSetStatus={setProjectStatus}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4 lg:space-y-6">
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

        <TabsContent value="tasks" className="space-y-4 lg:space-y-6">
          {current && (
            <header className="bg-muted/40 flex flex-wrap items-start justify-between gap-3 rounded-xl p-4">
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
              <div className="flex items-center gap-2">
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
                {/* Only an empty project can go, e.g. a suggested personal one she doesn't need. */}
                {current.open + current.done === 0 && (
                  <DeleteProjectButton
                    name={current.name}
                    onConfirm={() => removeProject(current)}
                  />
                )}
              </div>
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
          />
        </TabsContent>
      </Tabs>

      <AddTaskDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={openProjects}
        defaultProjectId={current && current.status !== "done" ? current.id : null}
      />

      <NewProjectDrawer
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
      />
    </div>
  );
}

function DeleteProjectButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Delete ${name}`}>
          <Trash2Icon />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This project has no tasks. Deleting it removes it from your list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

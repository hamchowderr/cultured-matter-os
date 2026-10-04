import { dueTasks, getUserSettings, listProjects, listTasks } from "@/actions/server";
import { projectStats, taskActivity } from "@/lib/project-stats";
import { generateMeta } from "@/lib/utils";
import { ProjectsView, type View } from "./projects-view";

export async function generateMetadata() {
  return generateMeta({
    title: "Projects",
    description: "Projects and tasks for everything in progress."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const VIEWS: View[] = ["overview", "projects", "tasks"];

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  // The Business / Personal / All switch narrows every view on this page.
  const settings = await getUserSettings();
  const saved = settings.ok ? settings.data.workScope : "all";
  const load = (scope: typeof saved) =>
    Promise.all([
      listProjects({ includeDone: true, scope }),
      listTasks({ scope }),
      dueTasks({ scope })
    ]);
  let scope = saved;
  let [projectList, taskList, due] = await load(scope);
  // A link to one project (from the bell, the calendar or the Inbox) opens it even when the
  // switch hides its side; the page then shows All (and the switch says so) for that visit.
  const wanted = one(sp.p);
  if (
    wanted &&
    scope !== "all" &&
    projectList.ok &&
    !projectList.data.projects.some((p) => p.id === wanted)
  ) {
    scope = "all";
    [projectList, taskList, due] = await load(scope);
  }
  if (!projectList.ok || !taskList.ok || !due.ok) {
    const error = [projectList, taskList, due].find((r) => !r.ok);
    return (
      <p className="text-destructive text-sm">
        Couldn’t load projects: {error && !error.ok ? error.error.message : "unknown error"}
      </p>
    );
  }

  const projects = projectList.data.projects;
  const tasks = taskList.data.tasks;
  const projectId = projects.find((p) => p.id === one(sp.p))?.id ?? null;
  const requested = one(sp.view) as View | undefined;
  const view: View = projectId ? "tasks" : VIEWS.includes(requested!) ? requested! : "overview";

  return (
    <ProjectsView
      scope={scope}
      view={view}
      projectId={projectId}
      dueSoon={one(sp.due) === "soon"}
      showDone={one(sp.done) === "1"}
      projects={projects}
      tasks={tasks}
      due={due.data}
      stats={projectStats(projects, tasks, due.data)}
      activity={taskActivity(tasks)}
    />
  );
}

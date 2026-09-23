import { getProject, listProjects } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { ProjectsView } from "./projects-view";

export async function generateMetadata() {
  return generateMeta({
    title: "Projects",
    description: "Projects and tasks for everything in progress."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const showDone = one(sp.done) === "1";
  const list = await listProjects({ includeDone: showDone });
  if (!list.ok) {
    return <p className="text-destructive text-sm">Couldn’t load projects: {list.error.message}</p>;
  }

  const projects = list.data.projects;
  const selectedId = projects.find((p) => p.id === one(sp.p))?.id ?? projects[0]?.id;
  const detail = selectedId ? await getProject({ projectId: selectedId }) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Businesses, their projects, and the tasks in each. A task can show up in more than one project."
      />
      <ProjectsView
        projects={projects}
        selected={detail?.ok ? detail.data : null}
        showDone={showDone}
      />
    </div>
  );
}

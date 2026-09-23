import { listCaptures, listProjects } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { InboxView } from "./inbox-view";

export async function generateMetadata() {
  return generateMeta({
    title: "Inbox",
    description: "Capture anything, then file it as a task, idea or reference."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const KINDS = ["task", "idea", "reference"] as const;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filed = one(sp.view) === "filed";
  const kind = KINDS.find((k) => k === one(sp.kind));
  const tier = [1, 2, 3].find((n) => String(n) === one(sp.tier));

  const [list, projects] = await Promise.all([
    listCaptures({ filed, kind: filed ? kind : undefined, tier: filed ? tier : undefined }),
    listProjects({})
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Jot anything down, then sort it: a task for a project, an idea, or a reference, with a tier from 1 (most important) to 3."
      />
      {list.ok ? (
        <InboxView
          captures={list.data.captures}
          unfiled={list.data.unfiled}
          projects={
            projects.ok
              ? projects.data.projects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  business: p.business
                }))
              : []
          }
          filters={{ filed, kind, tier }}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load the inbox: {list.error.message}</p>
      )}
    </div>
  );
}

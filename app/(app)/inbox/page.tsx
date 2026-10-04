import { cookies } from "next/headers";

import { listCaptures, listProjects } from "@/actions/server";
import { generateMeta } from "@/lib/utils";
import { Inbox } from "./components/inbox";

export async function generateMetadata() {
  return generateMeta({
    title: "Inbox",
    description: "Capture anything, then file it as a task, idea or reference."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const LAYOUT_COOKIE = "react-resizable-panels:layout:inbox";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const layout = (await cookies()).get(LAYOUT_COOKIE);
  let defaultLayout: Record<string, number> | undefined;
  try {
    defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  } catch {
    defaultLayout = undefined;
  }

  const [toSort, filed, projects] = await Promise.all([
    listCaptures({ filed: false, limit: 200 }),
    listCaptures({ filed: true, limit: 200 }),
    listProjects({})
  ]);

  if (!toSort.ok || !filed.ok) {
    const error = !toSort.ok ? toSort.error : !filed.ok ? filed.error : null;
    return <p className="text-destructive text-sm">Couldn’t load the inbox: {error?.message}</p>;
  }

  return (
    <div className="bg-card ring-foreground/10 h-(--content-full-height) overflow-hidden rounded-xl ring-1">
      <Inbox
        toSort={toSort.data.captures}
        filed={filed.data.captures}
        unfiled={toSort.data.unfiled}
        projects={
          projects.ok
            ? projects.data.projects.map((p) => ({ id: p.id, name: p.name, business: p.business }))
            : []
        }
        initialTab={one(sp.view) === "filed" ? "filed" : "sort"}
        defaultLayout={defaultLayout}
        cookieID={LAYOUT_COOKIE}
      />
    </div>
  );
}

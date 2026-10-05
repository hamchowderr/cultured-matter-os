import { listMindMaps } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { MapTabs } from "../components/map-tabs";
import { SavedMaps } from "../components/saved-maps";

export async function generateMetadata() {
  return generateMeta({
    title: "Saved maps",
    description: "Mind maps you have made: brainstorms, project plans, sponsor maps."
  });
}

export default async function Page() {
  const result = await listMindMaps({ limit: 200 });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Map"
        description="Your own mind maps: brainstorms, project plans, sponsor maps. Nodes can link to real projects, tasks, people, Radar companies, grants and ideas."
      />
      <MapTabs current="saved" />
      {result.ok ? (
        <SavedMaps maps={result.data.maps} />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load your maps: {result.error.message}</p>
      )}
    </div>
  );
}

import { getBusinessMap } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { BusinessMapView } from "./components/business-map-view";
import { MapTabs } from "./components/map-tabs";

export async function generateMetadata() {
  return generateMeta({
    title: "Map",
    description: "A live map of the business: projects, tasks, people, Radar, grants and ideas."
  });
}

export default async function Page() {
  const result = await getBusinessMap();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Map"
        description="Cultured Matter at the centre, drawn live from your projects, tasks, ideas, Radar, people and grants. Tap anything to open it. Pinch or scroll to zoom; drag to move around."
      />
      <MapTabs current="business" />
      {result.ok ? (
        <BusinessMapView map={result.data} />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load the map: {result.error.message}</p>
      )}
    </div>
  );
}

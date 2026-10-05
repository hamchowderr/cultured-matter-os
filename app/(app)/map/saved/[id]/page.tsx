import { notFound } from "next/navigation";

import { getBusinessMap, getMindMap } from "@/actions/server";
import { mapRecords } from "@/lib/business-map";
import { generateMeta } from "@/lib/utils";
import { MindMapEditor } from "../../components/mind-map-editor";

export async function generateMetadata() {
  return generateMeta({ title: "Mind map", description: "A saved mind map." });
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The business map supplies the records a node can be linked to.
  const [result, business] = await Promise.all([getMindMap({ mindMapId: id }), getBusinessMap()]);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return (
      <p className="text-destructive text-sm">Couldn’t load the map: {result.error.message}</p>
    );
  }
  return (
    <MindMapEditor
      map={result.data.map}
      records={result.data.records}
      pickable={business.ok ? mapRecords(business.data) : []}
    />
  );
}

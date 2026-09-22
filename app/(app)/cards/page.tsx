import { generateMeta } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-shell";
import { CardGallery } from "./gallery";

export async function generateMetadata() {
  return generateMeta({ title: "Cards", description: "Every card, rendered from sample data." });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cards" description="Every card, rendered from sample data. Not in the sidebar." />
      <CardGallery />
    </div>
  );
}

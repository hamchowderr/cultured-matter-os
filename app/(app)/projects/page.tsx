import { FolderKanbanIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Projects",
    description: "Projects and tasks for everything in progress."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Projects and tasks for everything in progress." />
      <ComingSoon
        icon={FolderKanbanIcon}
        title="No projects yet"
        description="Projects and their tasks will appear here."
      />
    </div>
  );
}

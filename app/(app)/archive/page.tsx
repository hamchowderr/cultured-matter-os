import { ArchiveIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Archive",
    description: "A timeline of everything you have done."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Archive" description="A timeline of everything you have done." />
      <ComingSoon
        icon={ArchiveIcon}
        title="Nothing logged yet"
        description="Every shortlist, pass, task and approval will be recorded here."
      />
    </div>
  );
}

import { LandmarkIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Grants",
    description: "Grant opportunities you can apply for, ordered by deadline."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Grants" description="Grant opportunities you can apply for, ordered by deadline." />
      <ComingSoon
        icon={LandmarkIcon}
        title="No grants yet"
        description="Federal and California grants open to for-profit companies will appear here."
      />
    </div>
  );
}

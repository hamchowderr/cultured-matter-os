import { RadarIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Radar",
    description: "Early-stage climate and materials startups from free feeds."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Radar" description="Early-stage climate and materials startups from free feeds." />
      <ComingSoon
        icon={RadarIcon}
        title="No companies yet"
        description="Startups from SOSV, Greentown Labs, Y Combinator and CTVC will appear here."
      />
    </div>
  );
}

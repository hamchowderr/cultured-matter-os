import { SunIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Today",
    description: "What needs you today: approvals, tasks due, grants closing soon and new radar finds."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Today" description="What needs you today: approvals, tasks due, grants closing soon and new radar finds." />
      <ComingSoon
        icon={SunIcon}
        title="Nothing here yet"
        description="Your approvals, due tasks, closing grants and new radar finds will appear here."
      />
    </div>
  );
}

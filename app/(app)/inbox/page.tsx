import { InboxIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "Inbox",
    description: "Capture anything, then file it as a task, idea or reference."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="Capture anything, then file it as a task, idea or reference." />
      <ComingSoon
        icon={InboxIcon}
        title="Inbox is empty"
        description="Captured notes land here until you file them into a project."
      />
    </div>
  );
}

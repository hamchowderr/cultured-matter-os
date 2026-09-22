import { UsersIcon } from "lucide-react";

import { generateMeta } from "@/lib/utils";
import { ComingSoon, PageHeader } from "@/components/layout/page-shell";

export async function generateMetadata() {
  return generateMeta({
    title: "People",
    description: "Your network, searchable by sector and company."
  });
}

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="People" description="Your network, searchable by sector and company." />
      <ComingSoon
        icon={UsersIcon}
        title="No contacts yet"
        description="Import your LinkedIn connections to see who can reach each company."
      />
    </div>
  );
}

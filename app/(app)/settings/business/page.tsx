import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { getBusinessProfileForEditing } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { generateMeta } from "@/lib/utils";

export async function generateMetadata() {
  return generateMeta({
    title: "Business",
    description:
      "Your business profile: what Cultured Matter is, the company details, your focus and your people. The AI reads it."
  });
}

export default async function Page() {
  // Session first: it marks the page as dynamic before the action runs.
  await getSession();
  const result = await getBusinessProfileForEditing();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/settings">
          <ArrowLeftIcon />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Business"
        description="One place for what Cultured Matter is. The AI reads this, so keep it current."
      />
      {result.ok ? (
        <BusinessProfileForm initial={result.data.profile} />
      ) : (
        <p className="text-destructive text-sm">
          Couldn’t load your business profile: {result.error.message}
        </p>
      )}
    </div>
  );
}

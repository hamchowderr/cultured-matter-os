import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { getVoiceGuideForEditing } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { VoiceGuideEditor } from "@/components/settings/voice-guide-editor";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { generateMeta } from "@/lib/utils";

export async function generateMetadata() {
  return generateMeta({
    title: "Your voice",
    description:
      "Your voice guide: how you write, built from your own writing. The AI follows it when it drafts for you, and you can copy it into ChatGPT or Claude."
  });
}

export default async function Page() {
  // Session first: it marks the page as dynamic before the action runs.
  await getSession();
  const result = await getVoiceGuideForEditing();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/settings">
          <ArrowLeftIcon />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Your voice"
        description="How you write, so everything the AI drafts for you sounds like you."
      />
      {result.ok ? (
        <VoiceGuideEditor
          initial={{
            guide: result.data.guide,
            sources: result.data.sources,
            updatedAt: result.data.updatedAt
          }}
        />
      ) : (
        <p className="text-destructive text-sm">
          Couldn’t load your voice guide: {result.error.message}
        </p>
      )}
    </div>
  );
}

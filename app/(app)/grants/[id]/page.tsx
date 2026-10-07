import {
  ArrowLeftIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CoinsIcon,
  ExternalLinkIcon
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getGrantApplication } from "@/actions/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { daysUntil, formatAmount, formatDeadline } from "@/lib/format";
import { generateMeta } from "@/lib/utils";
import { ApplicationEditor } from "./application-editor";

export async function generateMetadata() {
  return generateMeta({
    title: "Grant",
    description: "A grant and its draft application."
  });
}

// The grant's own page: its details and the drafted application (questions, answers, copy).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getGrantApplication({ grantId: id });
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return (
      <p className="text-destructive text-sm">Couldn’t load the grant: {result.error.message}</p>
    );
  }
  const { grant, application } = result.data;
  const amount = formatAmount(grant.amountMin, grant.amountMax);
  const days = grant.deadline ? daysUntil(grant.deadline) : null;
  const urgent = days != null && days >= 0 && days <= 14;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" className="-ml-2 h-11 md:h-9" asChild>
          <Link href="/grants">
            <ArrowLeftIcon />
            Grants
          </Link>
        </Button>
        <h1 className="text-2xl leading-snug font-semibold tracking-tight break-words md:text-3xl">
          {grant.title}
        </h1>
        {grant.agency && (
          <p className="text-muted-foreground flex items-start gap-1.5 text-sm break-words">
            <BuildingIcon className="mt-0.5 size-3.5 shrink-0" />
            {grant.agency}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={urgent ? "warning" : "outline"}>
            <CalendarDaysIcon />
            {formatDeadline(grant.deadline)}
          </Badge>
          {amount && (
            <Badge variant="outline">
              <CoinsIcon />
              {amount}
            </Badge>
          )}
          {grant.forProfitEligible ? (
            <Badge variant="success">For-profit eligible</Badge>
          ) : (
            <Badge variant="secondary">Nonprofit only</Badge>
          )}
        </div>
        {grant.url && (
          <Button variant="outline" className="h-11 w-full sm:w-auto md:h-9" asChild>
            <a href={grant.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              Open the listing
            </a>
          </Button>
        )}
      </div>

      <ApplicationEditor
        grantId={grant.id}
        grantTitle={grant.title}
        hasListing={!!grant.url}
        application={application}
      />

      {grant.description && (
        <details className="group rounded-lg border p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold md:min-h-0">
            About this grant
          </summary>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed break-words whitespace-pre-line">
            {grant.description}
          </p>
        </details>
      )}
    </div>
  );
}

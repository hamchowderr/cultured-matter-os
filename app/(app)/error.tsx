"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";

// Shown in place of a page that failed to load. The sidebar and header stay, so she can go
// somewhere else or try this page again.
export default function AppError({
  error,
  retry
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);

  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>This page didn&apos;t load</EmptyTitle>
        <EmptyDescription>
          Something went wrong on our side. Your saved work is safe. Try again, or open another page
          from the menu.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => retry()}>Try again</Button>
        {error.digest && (
          <p className="text-muted-foreground text-xs">Error code: {error.digest}</p>
        )}
      </EmptyContent>
    </Empty>
  );
}

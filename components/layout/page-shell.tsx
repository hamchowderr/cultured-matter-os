import type { LucideIcon } from "lucide-react";

import { ClampedText } from "@/components/layout/clamped-text";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";

export function PageHeader({
  title,
  description,
  tourId
}: {
  title: string;
  description: string;
  // The guided-tour step that points at this heading (lib/tours.ts).
  tourId?: string;
}) {
  return (
    <div className="space-y-1" data-tour-step-id={tourId}>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <ClampedText className="text-muted-foreground text-sm">{description}</ClampedText>
    </div>
  );
}

export function ComingSoon({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

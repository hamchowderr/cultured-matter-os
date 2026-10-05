import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export type ConnectionState = "connected" | "not_connected" | "waiting";

const BADGE: Record<
  ConnectionState,
  { label: string; variant: "success" | "outline" | "secondary" }
> = {
  connected: { label: "Connected", variant: "success" },
  not_connected: { label: "Not set up", variant: "outline" },
  waiting: { label: "Waiting", variant: "secondary" }
};

// One connection on Settings (from the UI kit's integrations1 card): what it is, where it
// stands, and the one thing to do next.
export function ConnectionCard({
  icon: Icon,
  title,
  description,
  state,
  stateLabel,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  state: ConnectionState;
  // Overrides the badge text (e.g. "Up to date" for something that isn't a connection).
  stateLabel?: string;
  action?: React.ReactNode;
}) {
  const badge = BADGE[state];
  return (
    <Card className="gap-0 pb-0 shadow-none">
      <CardContent>
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="text-muted-foreground bg-muted flex size-9 items-center justify-center rounded-lg">
            <Icon className="size-4" />
          </span>
          <Badge variant={badge.variant}>{stateLabel ?? badge.label}</Badge>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </CardContent>
      {action && <CardFooter className="bg-muted/40 px-(--card-spacing) py-3">{action}</CardFooter>}
    </Card>
  );
}

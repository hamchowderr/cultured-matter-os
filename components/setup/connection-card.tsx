import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  state: ConnectionState;
  action?: React.ReactNode;
}) {
  const badge = BADGE[state];
  return (
    <Card className={cn("gap-0 pb-0 shadow-none", state === "waiting" && "border-dashed")}>
      <CardContent className="pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="text-muted-foreground flex size-9 items-center justify-center rounded-lg border">
            <Icon className="size-4" />
          </span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </CardContent>
      {action && (
        <CardFooter className="bg-muted/50 border-t border-dashed px-6 py-4!">{action}</CardFooter>
      )}
    </Card>
  );
}

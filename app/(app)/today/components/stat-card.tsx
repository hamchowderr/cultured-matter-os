import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// One summary number, from the kit's default dashboard cards (Subscriptions / Total Revenue):
// title, big display number, one muted line under it. The whole card links to its screen.
export function StatCard({
  title,
  value,
  note,
  href,
  icon: Icon,
  alert
}: {
  title: string;
  value: string | number;
  note: React.ReactNode;
  href: string;
  icon: LucideIcon;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="group focus-visible:outline-none">
      <Card className="group-hover:border-primary/40 group-focus-visible:ring-ring h-full transition-colors group-focus-visible:ring-2">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardAction>
            <Icon className="text-muted-foreground size-4" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div
            className={cn("font-display text-3xl leading-6 tabular-nums", alert && "text-primary")}
          >
            {value}
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">{note}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

// Ported from the kit's project-management/components/summary-cards.tsx (v2.0.0) with real
// counts: the figure, then one line of context under it.
import { Briefcase, CalendarClock, CircleCheck, Hourglass, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectStats } from "@/lib/project-stats";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Stat({
  label,
  value,
  icon: Icon,
  children
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <Icon className="text-muted-foreground/50 size-4 max-sm:hidden lg:size-5" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="font-display text-2xl lg:text-3xl">{value}</div>
        <div className="mt-1 flex items-center gap-1.5">{children}</div>
      </CardContent>
    </Card>
  );
}

const Note = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground text-xs">{children}</span>
);

export function SummaryCards({ stats }: { stats: ProjectStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      <Stat label="Active projects" value={stats.activeProjects} icon={Briefcase}>
        <Note>{stats.pausedProjects ? `${stats.pausedProjects} paused` : "None paused"}</Note>
      </Stat>
      <Stat label="Due this week" value={stats.dueThisWeek} icon={CalendarClock}>
        {stats.overdue ? (
          <Badge variant="destructive">{plural(stats.overdue, "task")} overdue</Badge>
        ) : (
          <Note>Nothing overdue</Note>
        )}
      </Stat>
      <Stat label="Waiting for response" value={stats.waiting} icon={Hourglass}>
        {stats.replied ? (
          <Badge variant="success">{stats.replied} replied</Badge>
        ) : (
          <Note>No new replies</Note>
        )}
      </Stat>
      <Stat label="Done this month" value={stats.doneThisMonth} icon={CircleCheck}>
        <Note>{stats.doneLastMonth} last month</Note>
      </Stat>
    </div>
  );
}

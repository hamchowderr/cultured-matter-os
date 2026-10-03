// Ported from the kit's project-management/components/summary-cards.tsx with real counts.
import { Briefcase, CalendarClock, CircleCheck, Hourglass } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { ProjectStats } from "@/lib/project-stats";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SummaryCards({ stats }: { stats: ProjectStats }) {
  return (
    <div className="*:data-[slot=card]:from-primary/10 grid gap-4 *:data-[slot=card]:bg-gradient-to-t md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Active projects</CardTitle>
          <CardDescription>
            {stats.pausedProjects ? `${stats.pausedProjects} paused` : "None paused"}
          </CardDescription>
          <CardAction>
            <Briefcase className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.activeProjects}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Due this week</CardTitle>
          <CardDescription>
            {stats.overdue ? (
              <span className="text-red-600">{plural(stats.overdue, "task")} overdue</span>
            ) : (
              "Nothing overdue"
            )}
          </CardDescription>
          <CardAction>
            <CalendarClock className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.dueThisWeek}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Waiting for response</CardTitle>
          <CardDescription>
            {stats.replied ? (
              <span className="text-green-600">{stats.replied} replied</span>
            ) : (
              "No new replies"
            )}
          </CardDescription>
          <CardAction>
            <Hourglass className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.waiting}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Done this month</CardTitle>
          <CardDescription>{stats.doneLastMonth} last month</CardDescription>
          <CardAction>
            <CircleCheck className="text-muted-foreground/50 size-4 lg:size-6" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="font-display text-2xl lg:text-3xl">{stats.doneThisMonth}</div>
        </CardContent>
      </Card>
    </div>
  );
}

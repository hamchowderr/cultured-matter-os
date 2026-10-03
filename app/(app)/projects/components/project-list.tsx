"use client";

// Ported from the kit's project-list/page.tsx. Subtitle is the business, the team avatars
// become task counts, and the badge shows what needs attention.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { projectProgress, type ProjectSummary } from "../types";
import { projectStatusLabel } from "./table-recent-projects";

const PROGRESS_COLOR: Record<ProjectSummary["status"], string> = {
  active: "bg-green-500",
  paused: "bg-orange-500",
  done: "bg-blue-500"
};

function attention(p: ProjectSummary, nextDue: Date | undefined) {
  if (p.status !== "active") return { label: projectStatusLabel[p.status], color: "bg-gray-500" };
  if (p.overdue) return { label: `${p.overdue} overdue`, color: "bg-red-600" };
  if (nextDue) return { label: formatDue(nextDue), color: "bg-blue-500" };
  if (p.open === 0) return { label: "No open tasks", color: "bg-gray-500" };
  return { label: "No due dates", color: "bg-gray-500" };
}

export function ProjectList({
  projects,
  nextDue,
  onOpen
}: {
  projects: ProjectSummary[];
  nextDue: Map<string, Date>;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {projects.map((project) => {
        const progress = projectProgress(project);
        const badge = attention(project, nextDue.get(project.id));
        return (
          <button
            type="button"
            key={project.id}
            onClick={() => onOpen(project.id)}
            className="rounded-xl text-left"
          >
            <Card
              className={cn(
                "h-full transition-shadow hover:shadow-md",
                project.status !== "active" && "opacity-75"
              )}
            >
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>{project.business}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground mb-4 text-sm">
                  Started {formatDate(project.createdAt)}
                </div>

                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm opacity-90">Progress</span>
                    <span className="text-sm font-semibold">{progress}%</span>
                  </div>
                  <Progress
                    value={progress}
                    indicatorColor={PROGRESS_COLOR[project.status]}
                    aria-label="Tasks done"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="text-muted-foreground text-sm">
                    {project.open} open
                    {project.waiting > 0 && ` · ${project.waiting} waiting`}
                  </div>

                  <Badge className={`${badge.color} border-0 text-white`}>{badge.label}</Badge>
                </div>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

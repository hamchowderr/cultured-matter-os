"use client";

// Ported from the kit's project-list/components/project-list.tsx (v2.0.0): search, a grid or
// list view, and a card per project. Subtitle is the business, the team avatars become task
// counts, and the badge shows what needs attention.

import { FileSearchIcon, GridIcon, ListIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const counts = (p: ProjectSummary) =>
  `${p.open} open${p.waiting > 0 ? ` · ${p.waiting} waiting` : ""}`;

export function ProjectList({
  projects,
  nextDue,
  onOpen
}: {
  projects: ProjectSummary[];
  nextDue: Map<string, Date>;
  onOpen: (projectId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const q = searchQuery.trim().toLowerCase();
  const filtered = projects.filter((p) => `${p.name} ${p.business}`.toLowerCase().includes(q));

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative w-full lg:w-64">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50" />
          <Input
            placeholder="Search projects..."
            aria-label="Search projects"
            className="ps-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            className={cn(viewMode === "grid" && "bg-muted")}
            onClick={() => setViewMode("grid")}
          >
            <GridIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            className={cn(viewMode === "list" && "bg-muted")}
            onClick={() => setViewMode("list")}
          >
            <ListIcon />
          </Button>
        </ButtonGroup>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="bg-muted/30 mb-4 rounded-full p-6">
            <FileSearchIcon className="text-muted-foreground size-10" />
          </div>
          <h3 className="mb-1 text-lg font-medium">No projects found</h3>
          <p className="text-muted-foreground text-sm">{`No project matches "${searchQuery}".`}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-4">
          {filtered.map((project) => {
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
                      <div className="text-muted-foreground text-sm">{counts(project)}</div>
                      <Badge className={`${badge.color} border-0 text-white`}>{badge.label}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:gap-6">
          {filtered.map((project) => {
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
                    "transition-shadow hover:shadow-md",
                    project.status !== "active" && "opacity-75"
                  )}
                >
                  <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                    <div className="md:w-64">
                      <div className="text-sm font-semibold">{project.name}</div>
                      <div className="text-muted-foreground text-sm">{project.business}</div>
                    </div>
                    <div className="text-muted-foreground text-sm md:w-28">
                      {formatDate(project.createdAt)}
                    </div>
                    <div className="flex flex-1 items-center gap-3">
                      <Progress
                        value={progress}
                        indicatorColor={PROGRESS_COLOR[project.status]}
                        className="flex-1"
                        aria-label="Tasks done"
                      />
                      <span className="w-10 text-end text-sm font-semibold">{progress}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <div className="text-muted-foreground text-sm whitespace-nowrap">
                        {counts(project)}
                      </div>
                      <Badge className={`${badge.color} w-28 justify-center border-0 text-white`}>
                        {badge.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { format } from "date-fns";
import { MousePointerClickIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { classifyCapture } from "@/actions/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { type Capture, type Kind, KIND_LABEL, type Project } from "../use-inbox";

type DisplayProps = {
  capture: Capture | null;
  projects: Project[];
  onFiled: (id: string) => void;
};

// The kit's mail reading pane: header row, the message, and the reply box at the bottom,
// which here is the filing form.
export function CaptureDisplay({ capture, projects, onFiled }: DisplayProps) {
  return (
    <div className="flex h-full flex-col">
      <CaptureHeader capture={capture} />
      <Separator />
      {capture ? (
        <CaptureBody capture={capture} projects={projects} onFiled={onFiled} />
      ) : (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <MousePointerClickIcon className="size-8 opacity-50" />
          Nothing selected
        </div>
      )}
    </div>
  );
}

export function CaptureHeader({ capture }: { capture: Capture | null }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-2 p-2 px-4">
      {capture && (
        <>
          {capture.kind ? (
            <>
              <Badge variant="secondary">{KIND_LABEL[capture.kind]}</Badge>
              {capture.tier && <Badge variant="outline">Tier {capture.tier}</Badge>}
              {capture.projectName && capture.projectId && (
                <Badge variant="outline" asChild>
                  <Link href={`/projects?p=${capture.projectId}`}>{capture.projectName}</Link>
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="outline">To sort</Badge>
          )}
          <div className="text-muted-foreground ml-auto text-xs" suppressHydrationWarning>
            Captured {format(new Date(capture.createdAt), "PPp")}
          </div>
        </>
      )}
    </div>
  );
}

export function CaptureBody({
  capture,
  projects,
  onFiled,
  className
}: {
  capture: Capture;
  projects: Project[];
  onFiled: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {capture.body && <p className="text-sm whitespace-pre-wrap">{capture.body}</p>}
          {capture.imagePath && <CapturePhoto captureId={capture.id} />}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-4">
        <FilingForm key={capture.id} capture={capture} projects={projects} onFiled={onFiled} />
      </div>
    </div>
  );
}

function FilingForm({
  capture,
  projects,
  onFiled
}: {
  capture: Capture;
  projects: Project[];
  onFiled: (id: string) => void;
}) {
  const [kind, setKind] = React.useState<Kind | null>(capture.kind ?? null);
  const [tier, setTier] = React.useState<number | null>(capture.tier ?? null);
  const [projectId, setProjectId] = React.useState(capture.projectId ?? "");
  const [saving, setSaving] = React.useState(false);
  const needsProject = kind === "task" && !projectId;
  const ready = kind && tier && !needsProject;
  const refiling = !!capture.filedAt;

  async function file() {
    if (!kind || !tier) return;
    setSaving(true);
    const result = await classifyCapture({
      captureId: capture.id,
      kind,
      tier,
      projectId: projectId || undefined
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    const project = projects.find((p) => p.id === projectId);
    toast.success(
      kind === "task" && project
        ? `Added to ${project.name} as a task`
        : `Filed as ${KIND_LABEL[kind].toLowerCase()}`
    );
    onFiled(capture.id);
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        file();
      }}
    >
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">What is it?</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Kind">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={kind === k ? "default" : "outline"}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium">
          Tier <span className="text-muted-foreground font-normal">(1 is most important)</span>
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Tier">
          {[1, 2, 3].map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={tier === n ? "default" : "outline"}
              aria-pressed={tier === n}
              onClick={() => setTier(n)}
            >
              Tier {n}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          size="sm"
          className={cn("w-auto max-w-full", needsProject && "border-primary")}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project"
        >
          <NativeSelectOption value="">
            {kind === "task" ? "Choose a project…" : "No project"}
          </NativeSelectOption>
          {projects.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.business} / {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" className="ml-auto" disabled={!ready || saving}>
          {refiling ? "Update" : "File"}
        </Button>
      </div>
      {kind === "task" && projects.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Tasks need a project.{" "}
          <Link href="/projects" className="underline">
            Create one in Projects
          </Link>
          .
        </p>
      )}
    </form>
  );
}

// Photos sent from the iPhone Shortcut, served from private Blob storage to the signed-in user.
function CapturePhoto({ captureId }: { captureId: string }) {
  const src = `/api/photos/${captureId}`;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block" title="Open the full photo">
      <img
        src={src}
        alt="Photo sent from the iPhone"
        loading="lazy"
        className="bg-muted w-full rounded-md border object-contain"
      />
    </a>
  );
}

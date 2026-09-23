"use client";

import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { classifyCapture, createCapture, listCaptures } from "@/actions/server";
import { ComingSoon } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Capture = Extract<
  Awaited<ReturnType<typeof listCaptures>>,
  { ok: true }
>["data"]["captures"][number];
type Kind = "task" | "idea" | "reference";
type Project = { id: string; name: string; business: string };

const KIND_LABEL: Record<Kind, string> = { task: "Task", idea: "Idea", reference: "Reference" };

export function InboxView({
  captures,
  unfiled,
  projects,
  filters
}: {
  captures: Capture[];
  unfiled: number;
  projects: Project[];
  filters: { filed: boolean; kind?: Kind; tier?: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  async function capture() {
    if (!body.trim()) return;
    setSaving(true);
    const result = await createCapture({ body: body.trim() });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    setBody("");
    toast.success("Captured");
    if (filters.filed) update({ view: undefined, kind: undefined, tier: undefined });
    else refresh();
  }

  return (
    <div className={cn("space-y-6 transition-opacity", pending && "opacity-80")}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          capture();
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              capture();
            }
          }}
          rows={3}
          placeholder="What’s on your mind? A lead, an idea, a link, something to do…"
          aria-label="Capture"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Ctrl + Enter to capture</span>
          <Button type="submit" size="sm" disabled={saving || !body.trim()}>
            Capture
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={filters.filed ? "filed" : "sort"}
          onValueChange={(v) =>
            update({ view: v === "filed" ? "filed" : undefined, kind: undefined, tier: undefined })
          }
        >
          <TabsList>
            <TabsTrigger value="sort">
              To sort <span className="text-muted-foreground ml-1 tabular-nums">{unfiled}</span>
            </TabsTrigger>
            <TabsTrigger value="filed">Filed</TabsTrigger>
          </TabsList>
        </Tabs>
        {filters.filed && (
          <>
            <NativeSelect
              size="sm"
              className="w-auto"
              value={filters.kind ?? ""}
              onChange={(e) => update({ kind: e.target.value || undefined })}
              aria-label="Kind"
            >
              <NativeSelectOption value="">All kinds</NativeSelectOption>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <NativeSelectOption key={k} value={k}>
                  {KIND_LABEL[k]}s
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="w-auto"
              value={filters.tier ? String(filters.tier) : ""}
              onChange={(e) => update({ tier: e.target.value || undefined })}
              aria-label="Tier"
            >
              <NativeSelectOption value="">All tiers</NativeSelectOption>
              {[1, 2, 3].map((n) => (
                <NativeSelectOption key={n} value={String(n)}>
                  Tier {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </>
        )}
      </div>

      {captures.length === 0 ? (
        <ComingSoon
          icon={InboxIcon}
          title={filters.filed ? "Nothing filed yet" : "Inbox is empty"}
          description={
            filters.filed
              ? "Items you sort show up here."
              : "Everything is sorted. Capture something above."
          }
        />
      ) : filters.filed ? (
        <ul className="divide-y rounded-lg border">
          {captures.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{c.body}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.kind && <Badge variant="secondary">{KIND_LABEL[c.kind]}</Badge>}
                {c.tier && <Badge variant="outline">Tier {c.tier}</Badge>}
                {c.projectName && c.projectId && (
                  <Badge variant="outline" asChild>
                    <Link href={`/projects?p=${c.projectId}`}>{c.projectName}</Link>
                  </Badge>
                )}
                {c.filedAt && (
                  <span className="text-muted-foreground text-xs">{formatDate(c.filedAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {captures.map((c) => (
            <SortRow key={c.id} capture={c} projects={projects} onFiled={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SortRow({
  capture,
  projects,
  onFiled
}: {
  capture: Capture;
  projects: Project[];
  onFiled: () => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const needsProject = kind === "task" && !projectId;
  const ready = kind && tier && !needsProject;

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
    onFiled();
  }

  return (
    <li className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm whitespace-pre-wrap">{capture.body}</p>
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatDate(capture.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Kind">
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
        <div className="flex gap-1" role="group" aria-label="Tier">
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
        <NativeSelect
          size="sm"
          className={cn("w-auto", needsProject && "border-primary")}
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
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={!ready || saving}
          onClick={file}
        >
          File
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
    </li>
  );
}

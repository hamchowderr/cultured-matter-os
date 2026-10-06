"use client";

import { type Node, type NodeProps, Position } from "@xyflow/react";
import {
  BriefcaseBusinessIcon,
  CircleDotIcon,
  FolderKanbanIcon,
  LandmarkIcon,
  LightbulbIcon,
  Link2Icon,
  MoreHorizontalIcon,
  RadarIcon,
  UserIcon,
  type LucideIcon
} from "lucide-react";
import { memo } from "react";

import { BaseHandle } from "@/components/base-handle";
import { BaseNode } from "@/components/base-node";
import type { BusinessMapNode, BusinessNodeKind } from "@/lib/business-map";
import { RECORD_LABELS, type RecordLink, type RecordType } from "@/lib/mind-map";
import { cn } from "@/lib/utils";

// Node boxes have a fixed size so dagre (lib/map-layout.ts) can place them before they render.
export const NODE_SIZE = { width: 220, height: 60 };
export const ROOT_SIZE = { width: 240, height: 72 };

export const KIND_ICONS: Record<BusinessNodeKind, LucideIcon> = {
  business: BriefcaseBusinessIcon,
  hub: CircleDotIcon,
  project: FolderKanbanIcon,
  task: CircleDotIcon,
  idea: LightbulbIcon,
  company: RadarIcon,
  person: UserIcon,
  grant: LandmarkIcon,
  more: MoreHorizontalIcon
};

export const RECORD_ICONS: Record<RecordType, LucideIcon> = {
  project: FolderKanbanIcon,
  task: CircleDotIcon,
  contact: UserIcon,
  company: RadarIcon,
  grant: LandmarkIcon,
  idea: LightbulbIcon
};

// Each kind gets a coloured marker from the theme's chart palette, so it follows the preset.
const KIND_TONE: Record<BusinessNodeKind, string> = {
  business: "",
  hub: "text-muted-foreground",
  project: "text-(--chart-1)",
  task: "text-(--chart-2)",
  idea: "text-(--chart-3)",
  company: "text-(--chart-4)",
  person: "text-(--chart-5)",
  grant: "text-(--chart-1)",
  more: "text-muted-foreground"
};

// Handles on both sides: the right half of the map grows rightwards, the left half leftwards.
// They are only anchors for the edges, so they stay invisible on the business map.
function SideHandles({ hidden }: { hidden?: boolean }) {
  // React Flow's own stylesheet is unlayered, so its handle colours beat Tailwind's layered
  // utilities unless these are marked important.
  const cls = hidden
    ? "pointer-events-none opacity-0!"
    : "bg-background! border-muted-foreground/60! size-4! md:size-3!";
  return (
    <>
      <BaseHandle id="l" type="source" position={Position.Left} className={cls} />
      <BaseHandle id="r" type="source" position={Position.Right} className={cls} />
      <BaseHandle
        id="lt"
        type="target"
        position={Position.Left}
        className={cn(cls, "opacity-0!")}
      />
      <BaseHandle
        id="rt"
        type="target"
        position={Position.Right}
        className={cn(cls, "opacity-0!")}
      />
    </>
  );
}

export type BusinessFlowNode = Node<BusinessMapNode, "business">;

const dueFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function secondLine(n: BusinessMapNode) {
  if (n.kind === "task") {
    const bits = [
      n.status && n.status !== "todo" ? n.status.replace("_", " ") : null,
      n.priority === "urgent" || n.priority === "high" ? n.priority : null,
      n.due ? `due ${dueFormat.format(n.due)}` : null
    ].filter(Boolean);
    return bits.join(" · ") || "Task";
  }
  if (n.kind === "grant") {
    return [n.status, n.due ? `closes ${dueFormat.format(n.due)}` : "rolling"]
      .filter(Boolean)
      .join(" · ");
  }
  if (n.kind === "company") return [n.status, n.detail].filter(Boolean).join(" · ");
  if (n.kind === "project") return n.status === "paused" ? "Paused" : (n.detail ?? "Project");
  if (n.kind === "person") return n.detail ?? "Person";
  if (n.kind === "idea") return "Idea";
  return n.detail;
}

export const BusinessNodeView = memo(function BusinessNodeView({
  data
}: NodeProps<BusinessFlowNode>) {
  const Icon = KIND_ICONS[data.kind];
  if (data.kind === "business") {
    return (
      <BaseNode
        className="bg-primary text-primary-foreground flex items-center gap-2 rounded-xl border-0 px-4 shadow-md"
        style={ROOT_SIZE}
      >
        <SideHandles hidden />
        <Icon className="size-5 shrink-0" />
        <span className="line-clamp-2 text-base leading-tight font-semibold">{data.label}</span>
      </BaseNode>
    );
  }
  if (data.kind === "hub" || data.kind === "more") {
    return (
      <BaseNode
        className={cn(
          "bg-muted/60 flex items-center gap-2 rounded-full px-4",
          data.kind === "more" && "border-dashed"
        )}
        style={NODE_SIZE}
      >
        <SideHandles hidden />
        <Icon className={cn("size-4 shrink-0", KIND_TONE[data.kind])} />
        <span className="truncate text-sm font-medium">{data.label}</span>
      </BaseNode>
    );
  }
  const second = secondLine(data);
  return (
    <BaseNode
      className="flex cursor-pointer items-center gap-2.5 px-3 shadow-xs"
      style={NODE_SIZE}
      aria-label={`${RECORD_LABELS[data.record?.type ?? "project"]}: ${data.label}`}
    >
      <SideHandles hidden />
      <Icon className={cn("size-4 shrink-0", KIND_TONE[data.kind])} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-snug font-medium">{data.label}</div>
        {second && (
          <div className="text-muted-foreground truncate text-xs first-letter:uppercase">
            {second}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

// ---------------------------------------------------------------- Saved maps

export type IdeaNodeData = { label: string; link: RecordLink | null; linkTitle?: string | null };
export type IdeaFlowNode = Node<IdeaNodeData, "idea">;

export const IdeaNodeView = memo(function IdeaNodeView({
  data,
  selected
}: NodeProps<IdeaFlowNode>) {
  const LinkIcon = data.link ? RECORD_ICONS[data.link.type] : null;
  return (
    <BaseNode
      className={cn(
        "flex min-h-11 w-[200px] items-center gap-2 px-3 py-2 shadow-xs",
        selected && "ring-primary ring-2"
      )}
    >
      <SideHandles />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug font-medium break-words">{data.label}</div>
        {data.link && LinkIcon && (
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <Link2Icon className="size-3 shrink-0" />
            <LinkIcon className="size-3 shrink-0" />
            <span className="truncate">{data.linkTitle ?? RECORD_LABELS[data.link.type]}</span>
          </div>
        )}
      </div>
    </BaseNode>
  );
});

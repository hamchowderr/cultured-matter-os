"use client";

import {
  addEdge,
  type Connection,
  type Edge,
  type OnSelectionChangeFunc,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  Link2Icon,
  Link2OffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteMindMap, updateMindMap } from "@/actions/server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { layoutGraph } from "@/lib/map-layout";
import {
  MAX_LABEL,
  MAX_NODES,
  type MindMapEdge,
  type MindMapNode,
  type RecordLink,
  recordHref,
  recordKey
} from "@/lib/mind-map";
import { FLOW_DEFAULTS, MapChrome, MapFrame, useFlowColorMode } from "./map-frame";
import { type IdeaFlowNode, IdeaNodeView } from "./map-nodes";
import { type PickableRecord, RecordPicker } from "./record-picker";
import { TextDialog } from "./text-dialog";

const nodeTypes = { idea: IdeaNodeView };

export type LinkedRecord = {
  type: RecordLink["type"];
  id: string;
  title: string | null;
  href: string | null;
  missing: boolean;
};

type Props = {
  map: { id: string; title: string; nodes: MindMapNode[]; edges: MindMapEdge[] };
  records: LinkedRecord[];
  pickable: PickableRecord[];
};

const newId = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
const NODE_W = 200;
const NODE_H = 48;

function toFlowNodes(nodes: MindMapNode[], titles: Map<string, string | null>): IdeaFlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "idea",
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      link: n.link ?? null,
      linkTitle: n.link ? (titles.get(recordKey(n.link)) ?? null) : null
    }
  }));
}

// What gets saved: plain nodes and edges (lib/mind-map.ts), positions rounded.
function serialise(title: string, nodes: IdeaFlowNode[], edges: Edge[]) {
  return {
    title,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      link: n.data.link ?? null
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  };
}

// Edges attach on the sides that face each other, whichever way the nodes are dragged.
function withHandles(edges: Edge[], nodes: IdeaFlowNode[]): Edge[] {
  const x = new Map(nodes.map((n) => [n.id, n.position.x]));
  return edges.map((e) => {
    const rightward = (x.get(e.target) ?? 0) >= (x.get(e.source) ?? 0);
    return {
      ...e,
      sourceHandle: rightward ? "r" : "l",
      targetHandle: rightward ? "lt" : "rt"
    };
  });
}

function Editor({ map, records, pickable }: Props) {
  const router = useRouter();
  const colorMode = useFlowColorMode();
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow<IdeaFlowNode>();
  const titles = useMemo(
    () =>
      new Map<string, string | null>([
        ...pickable.map((r) => [recordKey(r), r.title] as const),
        ...records.map((r) => [recordKey(r), r.title] as const)
      ]),
    [records, pickable]
  );
  const hrefs = useMemo(
    () =>
      new Map<string, string | null>([
        ...pickable.map((r) => [recordKey(r), r.href] as const),
        ...records.map((r) => [recordKey(r), r.href] as const)
      ]),
    [records, pickable]
  );

  const [title, setTitle] = useState(map.title);
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaFlowNode>(
    toFlowNodes(map.nodes, titles)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(map.edges.map((e) => ({ ...e })));
  const [saved, setSaved] = useState(() =>
    JSON.stringify(serialise(map.title, toFlowNodes(map.nodes, titles), map.edges))
  );
  const current = JSON.stringify(serialise(title, nodes, edges));
  const dirty = current !== saved;
  const [saving, startSaving] = useTransition();

  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const onSelectionChange: OnSelectionChangeFunc<IdeaFlowNode> = useCallback(({ nodes, edges }) => {
    setSelectedNodes(nodes.map((n) => n.id));
    setSelectedEdges(edges.map((e) => e.id));
  }, []);
  const selected = nodes.find((n) => n.id === selectedNodes[0]) ?? null;

  const [renaming, setRenaming] = useState<"node" | "title" | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useCallback(() => {
    const body = serialise(title, nodes, edges);
    startSaving(async () => {
      const result = await updateMindMap({ mindMapId: map.id, ...body });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setSaved(JSON.stringify(body));
      toast.success("Map saved");
    });
  }, [title, nodes, edges, map.id]);

  // Cmd/Ctrl+S saves; leaving with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty, saving, save]);

  const select = (id: string) => setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));

  // A new node: a child of the selected node (to its right, below its other children), or in
  // the middle of the view when nothing is selected.
  const addNode = () => {
    if (nodes.length >= MAX_NODES) {
      toast.error(`A map can hold up to ${MAX_NODES} nodes`);
      return;
    }
    const id = newId("n-");
    let position;
    if (selected) {
      const kids = edges.filter((e) => e.source === selected.id).length;
      position = { x: selected.position.x + NODE_W + 60, y: selected.position.y + kids * 64 };
    } else {
      const frame = document.querySelector(".react-flow")?.getBoundingClientRect();
      const centre = frame
        ? { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const p = screenToFlowPosition(centre);
      position = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
    }
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: "idea", position, data: { label: "New idea", link: null }, selected: true }
    ]);
    if (selected) setEdges((es) => [...es, { id: newId("e-"), source: selected.id, target: id }]);
    setRenaming("node");
    setSelectedNodes([id]);
  };

  const removeSelected = () => {
    const gone = new Set(selectedNodes);
    setNodes((ns) => ns.filter((n) => !gone.has(n.id)));
    setEdges((es) =>
      es.filter((e) => !gone.has(e.source) && !gone.has(e.target) && !selectedEdges.includes(e.id))
    );
  };

  const rename = (label: string) => {
    if (renaming === "title") setTitle(label);
    else if (selected) {
      setNodes((ns) =>
        ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, label } } : n))
      );
    }
    setRenaming(null);
  };

  const link = (r: PickableRecord | null) => {
    if (!selected) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id !== selected.id
          ? n
          : {
              ...n,
              data: {
                // A fresh node takes the record's name.
                label:
                  r && n.data.label === "New idea" ? r.title.slice(0, MAX_LABEL) : n.data.label,
                link: r ? { type: r.type, id: r.id } : null,
                linkTitle: r?.title ?? null
              }
            }
      )
    );
    setLinking(false);
  };

  // Auto-layout with dagre, left to right.
  const tidy = () => {
    const pos = layoutGraph(
      getNodes().map((n) => ({
        id: n.id,
        width: n.measured?.width ?? NODE_W,
        height: n.measured?.height ?? NODE_H
      })),
      edges
    );
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    setTimeout(() => fitView({ ...FLOW_DEFAULTS.fitViewOptions, duration: 250 }), 30);
  };

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) => addEdge({ id: newId("e-"), source: c.source, target: c.target }, es)),
    [setEdges]
  );
  // No loops, and one link per pair of nodes.
  const isValidConnection = useCallback(
    (c: Connection | Edge) =>
      c.source !== c.target &&
      !edges.some(
        (e) =>
          (e.source === c.source && e.target === c.target) ||
          (e.source === c.target && e.target === c.source)
      ),
    [edges]
  );

  const removeMap = async () => {
    const result = await deleteMindMap({ mindMapId: map.id });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setSaved(current);
    toast.success(`Deleted ${result.data.title}`);
    router.push("/map/saved");
  };

  const selectedHref = selected?.data.link
    ? (hrefs.get(recordKey(selected.data.link)) ??
      recordHref(selected.data.link, { title: selected.data.linkTitle ?? undefined }))
    : null;
  const flowEdges = useMemo(() => withHandles(edges, nodes), [edges, nodes]);

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/map/saved">
            <ArrowLeftIcon />
            Saved maps
          </Link>
        </Button>
        {/* Its own line on a phone, so a long title isn't cut to a word. */}
        <h1 className="order-last w-full min-w-0 truncate text-2xl font-semibold tracking-tight sm:order-none sm:w-auto sm:flex-1">
          {title}
        </h1>
        <span className="text-muted-foreground ml-auto text-xs sm:ml-0" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
        </span>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          <SaveIcon />
          Save
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8" aria-label="Map options">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming("title")}>
              <PencilIcon />
              Rename map
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2Icon />
              Delete map
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MapFrame className="h-[calc(100dvh-var(--header-height)-12rem)] md:h-[calc(100dvh-var(--header-height)-9rem)]">
        <ReactFlow<IdeaFlowNode>
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onSelectionChange={onSelectionChange}
          onNodeDoubleClick={(_e, n) => {
            select(n.id);
            setSelectedNodes([n.id]);
            setRenaming("node");
          }}
          colorMode={colorMode}
          // Tap one handle, then another, to link two nodes on a touch screen.
          connectOnClick
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          {...FLOW_DEFAULTS}
        >
          <MapChrome />
          <Panel position="top-left" className="m-2! flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
            <Button size="sm" variant="secondary" onClick={addNode} className="shadow-sm">
              <PlusIcon />
              {selected ? "Add branch" : "Add node"}
            </Button>
            {selected && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shadow-sm"
                  onClick={() => setRenaming("node")}
                >
                  <PencilIcon />
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shadow-sm"
                  onClick={() => setLinking(true)}
                >
                  <Link2Icon />
                  {selected.data.link ? "Change link" : "Link record"}
                </Button>
                {selected.data.link && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-sm"
                    onClick={() => link(null)}
                    aria-label="Remove the link"
                  >
                    <Link2OffIcon />
                  </Button>
                )}
                {selectedHref && (
                  <Button size="sm" variant="secondary" className="shadow-sm" asChild>
                    <Link href={selectedHref}>
                      Open
                      <ArrowUpRightIcon />
                    </Link>
                  </Button>
                )}
              </>
            )}
            {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
              <Button
                size="sm"
                variant="secondary"
                className="text-destructive shadow-sm"
                onClick={removeSelected}
              >
                <Trash2Icon />
                Delete
              </Button>
            )}
            {!selected && nodes.length > 1 && (
              <Button size="sm" variant="secondary" className="shadow-sm" onClick={tidy}>
                <SparklesIcon />
                Tidy
              </Button>
            )}
          </Panel>
        </ReactFlow>
      </MapFrame>
      <p className="text-muted-foreground text-xs">
        Drag nodes to move them. To link two nodes, drag from one node’s dot to another’s, or tap
        one dot and then the other.
      </p>

      <TextDialog
        open={renaming !== null}
        title={renaming === "title" ? "Rename map" : "Node text"}
        label={renaming === "title" ? "Title" : "Text"}
        initial={renaming === "title" ? title : (selected?.data.label ?? "")}
        max={renaming === "title" ? 120 : MAX_LABEL}
        onCancel={() => setRenaming(null)}
        onSubmit={rename}
      />
      <RecordPicker
        open={linking}
        records={pickable}
        onOpenChange={setLinking}
        onPick={(r) => link(r)}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The map goes for good. The projects, people and other records it links to stay as they
              are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeMap}>
              Delete map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function MindMapEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor key={props.map.id} {...props} />
    </ReactFlowProvider>
  );
}

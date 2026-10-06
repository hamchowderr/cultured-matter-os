"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
  type OnSelectionChangeFunc,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi
} from "@xyflow/react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CableIcon,
  Link2Icon,
  Link2OffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  type MapSnapshot,
  type MindMapEdge,
  type MindMapNode,
  type RecordLink,
  reconcileIncoming,
  recordHref,
  recordKey
} from "@/lib/mind-map";
import { guardLink, useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { cn } from "@/lib/utils";
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

type MapProps = {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  updatedAt: Date;
};

type Props = { map: MapProps; records: LinkedRecord[]; pickable: PickableRecord[] };

const newId = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
const NODE_W = 200;
const NODE_H = 48;
// Toolbar buttons reach 44px on touch screens.
const TOOL = "shadow-sm touch:h-11 touch:px-3";

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

const toEdges = (edges: MindMapEdge[]): Edge[] =>
  edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));

// What gets saved: plain nodes and edges (lib/mind-map.ts), positions rounded.
function snapshot(title: string, nodes: IdeaFlowNode[], edges: Edge[]): MapSnapshot {
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
    return { ...e, sourceHandle: rightward ? "r" : "l", targetHandle: rightward ? "lt" : "rt" };
  });
}

const linked = (edges: Edge[], a: string, b: string) =>
  edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

function Editor({ map, records, pickable }: Props) {
  const router = useRouter();
  const colorMode = useFlowColorMode();
  const { fitView, getNodes } = useReactFlow<IdeaFlowNode>();
  const store = useStoreApi<IdeaFlowNode>();
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
  const [nodes, setNodes] = useState<IdeaFlowNode[]>(() => toFlowNodes(map.nodes, titles));
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(map.edges));
  // The version the editor's content is based on; sent with a save so a newer one isn't lost.
  const [loadedAt, setLoadedAt] = useState(() => new Date(map.updatedAt));
  // Set by the edits themselves (not by comparing the whole map on every drag frame).
  const [dirty, setDirty] = useState(false);
  // A newer version arrived while there were unsaved edits.
  const [conflict, setConflict] = useState(false);
  const [saving, startSaving] = useTransition();

  const load = useCallback(
    (m: MapProps) => {
      setTitle(m.title);
      setNodes(toFlowNodes(m.nodes, titles));
      setEdges(toEdges(m.edges));
      setLoadedAt(new Date(m.updatedAt));
      setDirty(false);
      setConflict(false);
    },
    [titles]
  );

  // The page re-renders with a newer map after a save here, or after the assistant changed
  // it (the chat refreshes the page after an approved write).
  const incomingAt = new Date(map.updatedAt).getTime();
  const latest = useRef({ title, nodes, edges, dirty });
  useEffect(() => {
    latest.current = { title, nodes, edges, dirty };
  });
  useEffect(() => {
    if (incomingAt <= loadedAt.getTime()) return;
    const cur = latest.current;
    const verdict = reconcileIncoming(
      { title: map.title, nodes: map.nodes, edges: map.edges },
      snapshot(cur.title, cur.nodes, cur.edges),
      cur.dirty
    );
    if (verdict === "same") setLoadedAt(new Date(map.updatedAt));
    else if (verdict === "adopt") load(map);
    else setConflict(true);
  }, [incomingAt]);

  // Leaving with unsaved edits asks first: tab close and reload via the browser, in-app links
  // through guardLink (lib/unsaved-changes.ts).
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  useUnsavedChangesGuard(dirty, setLeaveTo);

  const onNodesChange = useCallback((changes: NodeChange<IdeaFlowNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === "position" || c.type === "remove" || c.type === "add")) {
      setDirty(true);
    }
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type === "remove" || c.type === "add")) setDirty(true);
  }, []);

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
  // Touch-friendly linking: "Connect", then tap the node to link to.
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  const save = useCallback(() => {
    const body = snapshot(title, nodes, edges);
    startSaving(async () => {
      const result = await updateMindMap({
        mindMapId: map.id,
        ...body,
        expectedUpdatedAt: loadedAt
      });
      if (!result.ok) {
        if (result.error.code === "conflict") setConflict(true);
        toast.error(result.error.message);
        return;
      }
      setLoadedAt(new Date(result.data.updatedAt));
      setDirty(false);
      toast.success("Map saved");
    });
  }, [title, nodes, edges, map.id, loadedAt]);

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving && !conflict) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, conflict, save]);

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
      // The centre of the canvas, from React Flow's own size and viewport.
      const { width, height, transform } = store.getState();
      const [tx, ty, zoom] = transform;
      position = {
        x: (width / 2 - tx) / zoom - NODE_W / 2,
        y: (height / 2 - ty) / zoom - NODE_H / 2
      };
    }
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: "idea", position, data: { label: "New idea", link: null }, selected: true }
    ]);
    if (selected) setEdges((es) => [...es, { id: newId("e-"), source: selected.id, target: id }]);
    setDirty(true);
    setRenaming("node");
    setSelectedNodes([id]);
  };

  const removeSelected = () => {
    const gone = new Set(selectedNodes);
    setNodes((ns) => ns.filter((n) => !gone.has(n.id)));
    setEdges((es) =>
      es.filter((e) => !gone.has(e.source) && !gone.has(e.target) && !selectedEdges.includes(e.id))
    );
    setDirty(true);
  };

  const rename = (label: string) => {
    if (renaming === "title") setTitle(label);
    else if (selected) {
      setNodes((ns) =>
        ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, label } } : n))
      );
    }
    setRenaming(null);
    setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
    setTimeout(() => fitView({ ...FLOW_DEFAULTS.fitViewOptions, duration: 250 }), 30);
  };

  const connect = (source: string, target: string) => {
    if (source === target || linked(edges, source, target)) return false;
    setEdges((es) => addEdge({ id: newId("e-"), source, target }, es));
    setDirty(true);
    return true;
  };
  const onConnect = useCallback((c: Connection) => connect(c.source, c.target), [edges]);
  // No loops, and one link per pair of nodes.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => c.source !== c.target && !linked(edges, c.source, c.target),
    [edges]
  );
  const onNodeClick: NodeMouseHandler<IdeaFlowNode> = (_e, n) => {
    if (!connectFrom) return;
    if (n.id !== connectFrom) {
      if (connect(connectFrom, n.id)) toast.success("Linked");
      else toast.error("Those two are already linked");
    }
    setConnectFrom(null);
    select(n.id);
  };

  const removeMap = async () => {
    const result = await deleteMindMap({ mindMapId: map.id });
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setDirty(false);
    toast.success(`Deleted ${result.data.title}`);
    router.push("/map/saved");
  };

  const leave = () => {
    const to = leaveTo;
    setLeaveTo(null);
    setDirty(false);
    if (to) router.push(to);
  };

  const selectedHref = selected?.data.link
    ? (hrefs.get(recordKey(selected.data.link)) ??
      recordHref(selected.data.link, { title: selected.data.linkTitle ?? undefined }))
    : null;
  const flowEdges = useMemo(() => withHandles(edges, nodes), [edges, nodes]);

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="touch:h-11 -ml-2">
          <Link href="/map/saved" onNavigate={guardLink("/map/saved")}>
            <ArrowLeftIcon />
            Saved maps
          </Link>
        </Button>
        {/* Its own line on a phone, so a long title isn't cut to a word. */}
        <h1 className="order-last w-full min-w-0 truncate text-2xl font-semibold tracking-tight sm:order-none sm:w-auto sm:flex-1">
          {title}
        </h1>
        <span className="text-muted-foreground ml-auto text-xs sm:ml-0" aria-live="polite">
          {saving
            ? "Saving…"
            : conflict
              ? "Changed elsewhere"
              : dirty
                ? "Unsaved changes"
                : "Saved"}
        </span>
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || saving || conflict}
          className="touch:h-11"
        >
          <SaveIcon />
          Save
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="touch:size-11 size-8"
              aria-label="Map options"
            >
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

      {conflict && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
        >
          <p className="min-w-0 flex-1">
            This map changed somewhere else (perhaps the assistant) while you were editing. Saving
            now would undo that change, so reload to see it. Your unsaved edits here will be lost.
          </p>
          <Button size="sm" className="touch:h-11" onClick={() => load(map)}>
            <RefreshCwIcon />
            Reload the map
          </Button>
        </div>
      )}

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
          onNodeClick={onNodeClick}
          onNodeDoubleClick={(_e, n) => {
            select(n.id);
            setSelectedNodes([n.id]);
            setRenaming("node");
          }}
          colorMode={colorMode}
          // With a mouse, drag from one node's dot to another's (or click one dot, then the
          // other). On a touch screen the Connect button is the easier way.
          connectOnClick
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          {...FLOW_DEFAULTS}
        >
          <MapChrome />
          <Panel position="top-left" className="m-2! flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
            {connectFrom ? (
              <>
                <span className="bg-background/90 touch:h-11 flex items-center rounded-md px-3 text-sm shadow-sm">
                  Tap the node to link to
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className={TOOL}
                  onClick={() => setConnectFrom(null)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={addNode} className={TOOL}>
                  <PlusIcon />
                  {selected ? "Add branch" : "Add node"}
                </Button>
                {selected && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={TOOL}
                      onClick={() => setRenaming("node")}
                    >
                      <PencilIcon />
                      Rename
                    </Button>
                    {nodes.length > 1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className={TOOL}
                        onClick={() => setConnectFrom(selected.id)}
                      >
                        <CableIcon />
                        Connect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className={TOOL}
                      onClick={() => setLinking(true)}
                    >
                      <Link2Icon />
                      {selected.data.link ? "Change link" : "Link record"}
                    </Button>
                    {selected.data.link && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className={TOOL}
                        onClick={() => link(null)}
                        aria-label="Remove the link"
                      >
                        <Link2OffIcon />
                      </Button>
                    )}
                    {selectedHref && (
                      <Button size="sm" variant="secondary" className={TOOL} asChild>
                        <Link href={selectedHref} onNavigate={guardLink(selectedHref)}>
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
                    className={cn(TOOL, "text-destructive")}
                    onClick={removeSelected}
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                )}
                {!selected && nodes.length > 1 && (
                  <Button size="sm" variant="secondary" className={TOOL} onClick={tidy}>
                    <SparklesIcon />
                    Tidy
                  </Button>
                )}
              </>
            )}
          </Panel>
        </ReactFlow>
      </MapFrame>
      <p className="text-muted-foreground text-xs">
        Drag nodes to move them. To link two nodes, select one and tap Connect, or drag from one
        node’s dot to another’s.
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
      <AlertDialog open={leaveTo !== null} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              This map has changes that aren’t saved yet. If you leave now they’re lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={leave}>
              Leave without saving
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

"use client";

import {
  type Edge,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ALL_LAYERS,
  type BusinessMap,
  type BusinessMapNode,
  type Layer,
  LAYERS,
  visibleNodes
} from "@/lib/business-map";
import { layoutTwoSided } from "@/lib/map-layout";
import { FLOW_DEFAULTS, MapChrome, MapFrame, useFlowColorMode } from "./map-frame";
import { type BusinessFlowNode, BusinessNodeView, NODE_SIZE, ROOT_SIZE } from "./map-nodes";
import { RecordSheet } from "./record-sheet";

const nodeTypes = { business: BusinessNodeView };

function Flow({ map }: { map: BusinessMap }) {
  const colorMode = useFlowColorMode();
  const { fitView } = useReactFlow();
  const [layers, setLayers] = useState<Layer[]>(ALL_LAYERS);
  const [openId, setOpenId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const shown = visibleNodes(map, layers);
    const ids = new Set(shown.map((n) => n.id));
    const liveEdges = map.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const size = (n: BusinessMapNode) => (n.kind === "business" ? ROOT_SIZE : NODE_SIZE);
    const pos = layoutTwoSided(
      map.rootId,
      shown.map((n) => ({ id: n.id, side: n.side, ...size(n) })),
      liveEdges.filter((e) => e.kind === "tree")
    );
    const side = new Map(shown.map((n) => [n.id, n.side]));
    const nodes: BusinessFlowNode[] = shown.map((n) => ({
      id: n.id,
      type: "business",
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: n,
      ...size(n),
      draggable: false,
      connectable: false
    }));
    const x = (id: string) => pos.get(id)?.x ?? 0;
    const edges: Edge[] = liveEdges.map((e) => {
      // Edges leave the parent on the side facing the child.
      const rightward =
        e.kind === "cross" ? x(e.target) >= x(e.source) : side.get(e.target) !== "left";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: rightward ? "r" : "l",
        targetHandle: rightward ? "lt" : "rt",
        type: "default",
        focusable: false,
        selectable: false,
        style: e.kind === "cross" ? { strokeDasharray: "5 4", opacity: 0.7 } : { strokeWidth: 1.5 }
      };
    });
    return { nodes, edges };
  }, [map, layers]);

  // Refit when the set of nodes changes (a layer switched, or the data moved on).
  const signature = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    const t = setTimeout(() => fitView({ ...FLOW_DEFAULTS.fitViewOptions, duration: 250 }), 30);
    return () => clearTimeout(t);
  }, [signature, fitView]);

  const onNodeClick: NodeMouseHandler<BusinessFlowNode> = useCallback(
    (_e, node) => setOpenId(node.id),
    []
  );
  const open = map.nodes.find((n) => n.id === openId) ?? null;

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={layers}
        onValueChange={(v) => setLayers(v as Layer[])}
        aria-label="Layers shown on the map"
        className="flex w-full flex-wrap justify-start *:data-[slot=toggle-group-item]:flex-none"
      >
        {LAYERS.map((l) => (
          <ToggleGroupItem key={l.value} value={l.value} className="px-3">
            {l.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <MapFrame>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          colorMode={colorMode}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          {...FLOW_DEFAULTS}
        >
          <MapChrome />
        </ReactFlow>
      </MapFrame>
      <RecordSheet node={open} counts={map.counts} onClose={() => setOpenId(null)} />
    </div>
  );
}

// The map is rebuilt on the server from the tables on every visit. While it is open it also
// refreshes when she comes back to the tab and once a minute, so it follows changes made
// elsewhere (another screen, the assistant).
function useLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
}

export function BusinessMapView({ map }: { map: BusinessMap }) {
  useLiveRefresh();
  return (
    <ReactFlowProvider>
      <Flow map={map} />
    </ReactFlowProvider>
  );
}

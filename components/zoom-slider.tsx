"use client";

import React from "react";
import { Maximize, Minus, Plus } from "lucide-react";

import { Panel, useViewport, useStore, useReactFlow, type PanelProps } from "@xyflow/react";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ZoomSlider({
  className,
  orientation = "horizontal",
  compact = false,
  ...props
}: Omit<PanelProps, "children"> & {
  orientation?: "horizontal" | "vertical";
  // Buttons only (no slider or percentage), for small touch screens where pinch zooms.
  compact?: boolean;
}) {
  const { zoom } = useViewport();
  const { zoomTo, zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  return (
    <Panel
      className={cn(
        "bg-primary-foreground text-foreground flex gap-1 rounded-md p-1",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        className
      )}
      {...props}
    >
      <div
        className={cn("flex gap-1", orientation === "horizontal" ? "flex-row" : "flex-col-reverse")}
      >
        <Button
          variant="ghost"
          size="icon"
          className="touch:size-11"
          aria-label="Zoom out"
          onClick={() => zoomOut({ duration: 300 })}
        >
          <Minus className="h-4 w-4" />
        </Button>
        {!compact && (
          <Slider
            className={cn(orientation === "horizontal" ? "w-[140px]" : "h-[140px]")}
            orientation={orientation}
            value={[zoom]}
            min={minZoom}
            max={maxZoom}
            step={0.01}
            onValueChange={(values) => zoomTo(values[0])}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="touch:size-11"
          aria-label="Zoom in"
          onClick={() => zoomIn({ duration: 300 })}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {!compact && (
        <Button
          className={cn(
            "tabular-nums",
            orientation === "horizontal" ? "w-16" : "h-[40px] w-[40px]"
          )}
          variant="ghost"
          aria-label="Zoom to 100%"
          onClick={() => zoomTo(1, { duration: 300 })}
        >
          {(100 * zoom).toFixed(0)}%
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="touch:size-11"
        aria-label="Fit the whole map"
        onClick={() => fitView({ duration: 300 })}
      >
        <Maximize className="h-4 w-4" />
      </Button>
    </Panel>
  );
}

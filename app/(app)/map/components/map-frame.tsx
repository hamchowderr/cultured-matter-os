"use client";

import "@xyflow/react/dist/style.css";

import { Background, type ColorMode } from "@xyflow/react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";

import { ZoomSlider } from "@/components/zoom-slider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// The box both maps draw in: it fills the screen below the page header, so the page itself
// never scrolls sideways; panning and pinch-zoom happen inside it.
export function MapFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Phones have a taller header block above the map (the description wraps).
        "bg-card relative h-[calc(100dvh-var(--header-height)-17rem)] min-h-[360px] w-full overflow-hidden rounded-xl border md:h-[calc(100dvh-var(--header-height)-12rem)]",
        className
      )}
    >
      {children}
    </div>
  );
}

// React Flow follows the app's light/dark mode.
export function useFlowColorMode(): ColorMode {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}

// Shared React Flow settings: zoom range, and how touch and the mouse move the view.
export const FLOW_DEFAULTS = {
  minZoom: 0.08,
  maxZoom: 2,
  // Pinch zooms and one finger pans on touch; the wheel zooms with a mouse.
  zoomOnPinch: true,
  panOnDrag: true,
  zoomOnDoubleClick: false,
  fitViewOptions: { padding: 0.12, maxZoom: 1 }
} as const;

// Dots behind the nodes, and the React Flow UI zoom slider: on a phone just the zoom out, zoom in
// and fit buttons (pinch zooms there), sized for a finger.
export function MapChrome() {
  const isMobile = useIsMobile();
  return (
    <>
      <Background gap={22} size={1} />
      <ZoomSlider
        position="bottom-left"
        orientation="horizontal"
        compact={isMobile}
        className="border shadow-sm"
      />
    </>
  );
}

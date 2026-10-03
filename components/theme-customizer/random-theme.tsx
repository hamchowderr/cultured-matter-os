"use client";

import { ShuffleIcon } from "lucide-react";
import { useThemeConfig } from "@/components/active-theme";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  SIDEBAR_VARIANTS,
  THEME_COLORS,
  THEME_DISPLAY_FONTS,
  THEME_FONTS
} from "@/lib/themes";

const RADIUS_OPTIONS = ["none", "sm", "md", "lg", "xl"] as const;
const SCALE_OPTIONS = ["none", "sm", "lg"] as const;
const CONTENT_LAYOUT_OPTIONS = ["full", "centered"] as const;
const SIDEBAR_COLLAPSE_OPTIONS = ["expanded", "icon", "offcanvas"] as const;

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

export function RandomThemeButton() {
  const { theme, setTheme } = useThemeConfig();
  const { setOpen } = useSidebar();

  const randomThemeHandle = () => {
    // THEME_COLORS is ordered by hue, so nearby entries are harmonious.
    // Pick the chart color as the theme color itself or a close neighbor
    // on the palette wheel.
    const colorIndex = Math.floor(Math.random() * THEME_COLORS.length);
    const chartOffset = pick([-2, -1, 0, 0, 1, 2]);
    const chartIndex = (colorIndex + chartOffset + THEME_COLORS.length) % THEME_COLORS.length;

    const sidebarCollapse = pick(SIDEBAR_COLLAPSE_OPTIONS);
    setOpen(sidebarCollapse === "expanded");

    setTheme({
      ...theme,
      preset: "default",
      color: THEME_COLORS[colorIndex].value,
      chartPreset: THEME_COLORS[chartIndex].value,
      font: pick(THEME_FONTS).value,
      displayFont: pick(THEME_DISPLAY_FONTS).value,
      radius: pick(RADIUS_OPTIONS),
      scale: pick(SCALE_OPTIONS),
      contentLayout: pick(CONTENT_LAYOUT_OPTIONS),
      sidebarVariant: pick(SIDEBAR_VARIANTS),
      sidebarCollapsible:
        sidebarCollapse === "expanded" ? theme.sidebarCollapsible : sidebarCollapse
    });
  };

  return (
    <Button variant="outline" className="flex-1" onClick={randomThemeHandle}>
      <ShuffleIcon />
      Random
    </Button>
  );
}

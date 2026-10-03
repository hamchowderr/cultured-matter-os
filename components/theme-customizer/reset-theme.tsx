"use client";

import { useTheme } from "next-themes";
import { useThemeConfig } from "@/components/active-theme";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { DEFAULT_THEME } from "@/lib/themes";

export function ResetThemeButton() {
  const { setTheme } = useThemeConfig();
  const { setTheme: setColorSchema } = useTheme();
  const { setOpen } = useSidebar();

  const resetThemeHandle = () => {
    setColorSchema("light");
    setOpen(true);
    setTheme(DEFAULT_THEME);
  };

  return (
    <Button className="flex-1" onClick={resetThemeHandle}>
      Reset to default
    </Button>
  );
}

"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import Search from "@/components/layout/header/search";
import ThemeSwitch from "@/components/layout/header/theme-switch";
import { ThemeCustomizerPanel } from "@/components/theme-customizer";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function SiteHeader() {
  const { toggleSidebar, open } = useSidebar();

  return (
    <header className="bg-background/40 sticky top-0 z-50 flex h-(--header-height) shrink-0 items-center gap-2 border-b backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) md:rounded-tl-xl md:rounded-tr-xl">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2">
        <Button onClick={toggleSidebar} size="icon" variant="ghost">
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Search />

        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <ThemeCustomizerPanel />
        </div>
      </div>
    </header>
  );
}

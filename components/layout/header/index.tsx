"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import Search from "@/components/layout/header/search";
import Notifications from "@/components/layout/header/notifications";
import ThemeSwitch from "@/components/layout/header/theme-switch";
import { ThemeCustomizerPanel } from "@/components/theme-customizer";
import { TourButton } from "@/components/tours/app-tours";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function SiteHeader() {
  const { toggleSidebar, open } = useSidebar();

  return (
    // Installed on an iPhone with viewport-fit=cover, the header grows by the top safe-area inset
    // so its controls sit below the Dynamic Island; the side insets cover landscape.
    <header className="bg-background sticky top-0 z-50 flex h-[calc(var(--header-height)+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b pt-[env(safe-area-inset-top)] transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] lg:gap-2">
        <Button
          onClick={toggleSidebar}
          size="icon"
          variant="ghost"
          aria-label="Menu"
          data-tour-step-id="tour-menu-button"
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Search />

        <div className="ml-auto flex items-center gap-2">
          <TourButton />
          <Notifications />
          <ThemeSwitch />
          <ThemeCustomizerPanel />
        </div>
      </div>
    </header>
  );
}

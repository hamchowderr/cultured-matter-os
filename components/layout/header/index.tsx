"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import Notifications from "@/components/layout/header/notifications";
import Search from "@/components/layout/header/search";
import ThemeSwitch from "@/components/layout/header/theme-switch";
import UserMenu from "@/components/layout/header/user-menu";
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
          <Button
            size="sm"
            variant="link"
            className="relative animate-pulse bg-linear-to-r from-violet-600 via-fuchsia-600 to-cyan-600 bg-clip-text font-medium text-transparent hover:bg-transparent"
            asChild>
            <Link href="https://shadcnuikit.com/pricing" target="_blank">
              Get Pro
            </Link>
          </Button>
          <Notifications />
          <ThemeSwitch />
          <ThemeCustomizerPanel />
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useIsTablet } from "@/hooks/use-mobile";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/layout/sidebar/nav-main";
import { NavUser, type SidebarUser } from "@/components/layout/sidebar/nav-user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useThemeConfig } from "@/components/active-theme";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/themes";

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: SidebarUser }) {
  const pathname = usePathname();
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  const isTablet = useIsTablet();
  // Variant and collapse style come from the theme customizer (as in the kit v2 app-sidebar).
  const { theme } = useThemeConfig();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname]);

  // Collapse on a tablet-width window, and open again when the window grows past it. Only
  // a change of size does this: on a desktop load the remembered state (the sidebar_state
  // cookie the layout reads) stands, so a collapsed sidebar doesn't spring open.
  const wasTablet = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (isTablet === undefined) return;
    const changed = wasTablet.current !== undefined && wasTablet.current !== isTablet;
    if (changed || (wasTablet.current === undefined && isTablet)) setOpen(!isTablet);
    wasTablet.current = isTablet;
  }, [isTablet]);

  return (
    <Sidebar
      collapsible={theme.sidebarCollapsible as SidebarCollapsible}
      variant={theme.sidebarVariant as SidebarVariant}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="hover:text-foreground h-10 group-data-[collapsible=icon]:px-0!"
              asChild
            >
              <Link href="/today">
                <span className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                  CM
                </span>
                <span className="text-foreground font-semibold">Cultured Matter</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-full">
          <NavMain />
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

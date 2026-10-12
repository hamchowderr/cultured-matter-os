"use client";

import * as React from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar
} from "@/components/ui/sidebar";
import {
  ArchiveIcon,
  ChevronRight,
  FolderKanbanIcon,
  GlobeIcon,
  InboxIcon,
  LandmarkIcon,
  MessageCircleIcon,
  NetworkIcon,
  PencilLineIcon,
  RadarIcon,
  SunIcon,
  UsersIcon,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { guardLink } from "@/lib/unsaved-changes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePathname } from "next/navigation";
import { useChatEnabled } from "@/components/layout/chat-dock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

type NavGroup = {
  title: string;
  items: NavItem;
};

type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  isComing?: boolean;
  isDataBadge?: string;
  isNew?: boolean;
  newTab?: boolean;
  items?: NavItem;
}[];

export const navItems: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { title: "Today", href: "/today", icon: SunIcon },
      { title: "Chat", href: "/chat", icon: MessageCircleIcon },
      { title: "Inbox", href: "/inbox", icon: InboxIcon },
      { title: "Projects", href: "/projects", icon: FolderKanbanIcon },
      { title: "People", href: "/people", icon: UsersIcon },
      { title: "Radar", href: "/radar", icon: RadarIcon },
      { title: "Grants", href: "/grants", icon: LandmarkIcon },
      { title: "Map", href: "/map", icon: NetworkIcon },
      { title: "Archive", href: "/archive", icon: ArchiveIcon }
    ]
  },
  {
    title: "Website",
    items: [
      {
        title: "Your website",
        href: "https://www.culturedmatter.com",
        icon: GlobeIcon,
        newTab: true
      },
      {
        title: "Edit website (WordPress)",
        href: "https://culturedmatter.otakusolutions.io/wp-admin",
        icon: PencilLineIcon,
        newTab: true
      }
    ]
  }
];

// The pages to offer: Chat only when the server has an agent (lib/chat-enabled.ts).
export function useNavItems(): NavGroup[] {
  const chatEnabled = useChatEnabled();
  return React.useMemo(
    () =>
      chatEnabled
        ? navItems
        : navItems.map((g) => ({ ...g, items: g.items.filter((i) => i.href !== "/chat") })),
    [chatEnabled]
  );
}

export function NavMain() {
  const pathname = usePathname();
  const items = useNavItems();
  const { isMobile } = useSidebar();

  return (
    <>
      {items.map((nav, i) => (
        <SidebarGroup key={nav.title} data-tour-step-id={i === 0 ? "tour-nav" : undefined}>
          <SidebarGroupLabel>{nav.title}</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu className="gap-1">
              {nav.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {Array.isArray(item.items) && item.items.length > 0 ? (
                    <>
                      <div className="hidden group-data-[collapsible=icon]:block">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuButton tooltip={item.title}>
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side={isMobile ? "bottom" : "right"}
                            align={isMobile ? "end" : "start"}
                            className="min-w-48 rounded-lg"
                          >
                            <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
                            {item.items?.map((item) => (
                              <DropdownMenuItem
                                className="hover:text-foreground active:text-foreground hover:bg-sidebar-accent! active:bg-sidebar-accent!"
                                asChild
                                key={item.title}
                              >
                                <a href={item.href}>{item.title}</a>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Collapsible
                        className="group/collapsible block group-data-[collapsible=icon]:hidden"
                        defaultOpen={!!item.items.find((s) => s.href === pathname)}
                      >
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className="hover:text-foreground hover:bg-sidebar-foreground/5 active:bg-sidebar-foreground/10 data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground"
                            tooltip={item.title}
                          >
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item?.items?.map((subItem, key) => (
                              <SidebarMenuSubItem key={key}>
                                <SidebarMenuSubButton
                                  className="hover:text-foreground hover:bg-sidebar-foreground/5 active:bg-sidebar-foreground/10 data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground"
                                  isActive={pathname === subItem.href}
                                  asChild
                                >
                                  <Link
                                    href={subItem.href}
                                    target={subItem.newTab ? "_blank" : ""}
                                    onNavigate={guardLink(subItem.href)}
                                  >
                                    <span>{subItem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  ) : (
                    <SidebarMenuButton
                      className="hover:text-foreground hover:bg-sidebar-foreground/5 active:bg-sidebar-foreground/10 data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground"
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      asChild
                    >
                      {item.newTab ? (
                        // Outside the app: opens in a new tab, so unsaved work here stays put.
                        <a href={item.href} target="_blank" rel="noopener noreferrer">
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </a>
                      ) : (
                        <Link href={item.href} onNavigate={guardLink(item.href)}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  )}
                  {!!item.isComing && (
                    <SidebarMenuBadge className="peer-hover/menu-button:text-foreground opacity-50">
                      Coming
                    </SidebarMenuBadge>
                  )}
                  {!!item.isNew && (
                    <SidebarMenuBadge className="border border-green-400 text-green-600 peer-hover/menu-button:text-green-600">
                      New
                    </SidebarMenuBadge>
                  )}
                  {!!item.isDataBadge && (
                    <SidebarMenuBadge className="peer-hover/menu-button:text-foreground">
                      {item.isDataBadge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

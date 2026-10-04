"use client";

import {
  ChevronsUpDownIcon,
  CircleHelpIcon,
  CompassIcon,
  LogOutIcon,
  SettingsIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useAppTours } from "@/components/tours/app-tours";
import { authClient } from "@/lib/auth-client";

// Lets the account menu finish closing before a tour measures the page.
const MENU_CLOSE_MS = 200;

export type SidebarUser = { name: string; email: string; image?: string | null };

function initials(user: SidebarUser) {
  const source = user.name.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Signed-in account and sign out, pinned to the bottom of the sidebar.
export function NavUser({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { pageTour, startTour } = useAppTours();

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const avatar = (
    <Avatar className="size-8 rounded-md">
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback className="rounded-md text-xs">{initials(user)}</AvatarFallback>
    </Avatar>
  );
  const identity = (
    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
      {user.name && <span className="truncate font-medium">{user.name}</span>}
      <span className="text-muted-foreground truncate text-xs">{user.email}</span>
    </div>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
              aria-label="Account"
              data-tour-step-id="tour-account"
            >
              {avatar}
              {identity}
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              {avatar}
              {identity}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            {pageTour && (
              <DropdownMenuItem onSelect={() => startTour(pageTour.id, MENU_CLOSE_MS)}>
                <CompassIcon />
                Take a tour of this page
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => startTour("welcome", MENU_CLOSE_MS)}>
              <CircleHelpIcon />
              Show the welcome tour again
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} disabled={signingOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

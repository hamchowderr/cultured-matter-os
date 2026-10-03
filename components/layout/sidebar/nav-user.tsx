"use client";

import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

export type SidebarUser = { name: string; email: string; image?: string | null };

function initials(user: SidebarUser) {
  const source = user.name.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Signed-in account and sign out, pinned to the bottom of the sidebar.
export function NavUser({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);

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
            >
              {avatar}
              {identity}
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
            className="w-60"
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              {avatar}
              {identity}
            </DropdownMenuLabel>
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

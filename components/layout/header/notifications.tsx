"use client";

// Ported from the UI kit v2.0.0 header (components/layout/header/notifications.tsx).
// The kit's sample data is replaced by listNotifications; avatars become an icon per kind.

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  CheckCheckIcon,
  ClockIcon,
  InboxIcon,
  LandmarkIcon,
  MailIcon,
  RadarIcon,
  ShieldCheckIcon,
  type LucideIcon
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationsRead } from "@/actions/server";
import type { NotificationItem } from "@/actions/notifications";

const KIND_ICON: Record<NotificationItem["kind"], LucideIcon> = {
  approval: ShieldCheckIcon,
  reply: MailIcon,
  grant: LandmarkIcon,
  radar: RadarIcon,
  inbox: InboxIcon
};

function timeAgo(at: Date, now = new Date()) {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(at);
}

const Notifications = () => {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const r = await listNotifications();
      if (r.ok) setItems(r.data.items.map((i) => ({ ...i, at: new Date(i.at) })));
    });
  }, []);

  // Refresh on every page change, so the bell catches up after she acts on something.
  useEffect(load, [pathname, load]);

  const unread = items.filter((i) => !i.read);

  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)));
    startTransition(async () => {
      const r = await markNotificationsRead({ itemIds: ids });
      if (!r.ok) load();
    });
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="relative"
          aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        >
          <BellIcon />
          {unread.length > 0 && (
            <span className="bg-destructive absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-medium text-white tabular-nums">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={isMobile ? "center" : "end"} className="ms-4 w-80 p-0">
        <DropdownMenuLabel className="bg-background dark:bg-muted sticky top-0 z-10 p-0">
          <div className="flex justify-between border-b px-6 py-4">
            <div className="font-medium">Notifications</div>
            {unread.length > 0 && (
              <Button
                variant="link"
                className="h-auto p-0 text-xs"
                size="sm"
                onClick={() => markRead(unread.map((i) => i.id))}
              >
                <CheckCheckIcon className="size-3.5" />
                Mark all as read
              </Button>
            )}
          </div>
        </DropdownMenuLabel>

        {items.length === 0 ? (
          <div className="text-muted-foreground px-6 py-10 text-center text-sm">
            Nothing needs you right now.
          </div>
        ) : (
          <ScrollArea className={items.length > 4 ? "h-[350px]" : undefined}>
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="group flex cursor-pointer items-start gap-9 rounded-none border-b px-4 py-3"
                >
                  <Link href={item.href} onClick={() => !item.read && markRead([item.id])}>
                    <div className="flex flex-1 items-start gap-2">
                      <div className="flex-none">
                        <Avatar className="size-8">
                          <AvatarFallback>
                            <Icon className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        <div className="text-muted-foreground line-clamp-2 text-xs">
                          {item.description}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <ClockIcon className="size-3!" />
                          {timeAgo(item.at)}
                        </div>
                      </div>
                    </div>
                    {!item.read && (
                      <div className="flex-0">
                        <span className="bg-destructive/80 block size-2 rounded-full border" />
                      </div>
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Notifications;

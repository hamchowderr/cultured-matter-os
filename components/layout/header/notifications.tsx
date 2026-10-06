"use client";

// Ported from the UI kit v2.0.0 header (components/layout/header/notifications.tsx).
// The kit's sample data is replaced by listNotifications; avatars become an icon per kind.

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { guardLink } from "@/lib/unsaved-changes";
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
import {
  listNotifications,
  markNotificationsRead,
  pushStatus,
  savePushSubscription
} from "@/actions/server";
import type { NotificationItem } from "@/actions/notifications";
import { currentSubscription, setIconBadge, subscriptionJson } from "@/lib/push-client";
import { cn } from "@/lib/utils";

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
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const r = await listNotifications();
      if (r.ok) {
        setItems(r.data.items.map((i) => ({ ...i, at: new Date(i.at) })));
        setLoaded(true);
      }
    });
  }, []);

  // Refresh on every page change, so the bell catches up after she acts on something.
  useEffect(load, [pathname, load]);

  const unread = items.filter((i) => !i.read);

  // The app icon's badge is the bell's unread count; reading items here clears it.
  useEffect(() => {
    if (loaded) setIconBadge(unread.length);
  }, [loaded, unread.length]);

  // Once per app open: if this device allowed notifications but the server no longer has its
  // subscription (the browser can renew it), save it again.
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    currentSubscription()
      .then(async (sub) => {
        if (!sub) return;
        const status = await pushStatus({ endpoint: sub.endpoint });
        if (status.ok && status.data.configured && !status.data.thisDevice) {
          await savePushSubscription(subscriptionJson(sub));
        }
      })
      .catch(() => {});
  }, []);

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
          data-tour-step-id="tour-bell"
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

      <DropdownMenuContent
        align={isMobile ? "center" : "end"}
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <DropdownMenuLabel className="bg-background dark:bg-muted sticky top-0 z-10 p-0">
          <div className="flex justify-between px-4 pt-4 pb-2">
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
          <ScrollArea className={cn("pb-1", items.length > 4 && "h-[350px]")}>
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="group mx-1 flex cursor-pointer items-start gap-9 rounded-md px-3 py-3"
                >
                  <Link
                    href={item.href}
                    onClick={() => !item.read && markRead([item.id])}
                    onNavigate={guardLink(item.href)}
                  >
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
                        <span className="bg-destructive/80 block size-2 rounded-full" />
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

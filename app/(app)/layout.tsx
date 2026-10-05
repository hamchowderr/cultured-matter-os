import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { SiteHeader } from "@/components/layout/header";
import { getUserSettings } from "@/actions/server";
import { AppTours } from "@/components/tours/app-tours";
import { ChatDock, ChatDockProvider } from "@/components/layout/chat-dock";
import { PageScrollRestoration } from "@/components/layout/page-scroll-restoration";
import {
  CHAT_DOCK_OPEN_COOKIE,
  CHAT_DOCK_WIDTH_COOKIE,
  parseDockOpen,
  parseDockWidth
} from "@/lib/chat-dock";
import { getSession } from "@/lib/session";
import { parseSeen } from "@/lib/tours";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // proxy.ts already redirects signed-out visitors; this keeps the layout safe on its own.
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { name, email, image } = session.user;

  // Tours she has finished or skipped. If the settings can't load, treat the welcome tour as
  // seen rather than risk starting it again.
  const settings = await getUserSettings();
  const toursSeen = settings.ok ? parseSeen(settings.data.toursSeen) : parseSeen(["welcome"]);

  const cookieStore = await cookies();
  const defaultOpen =
    cookieStore.get("sidebar_state")?.value === "true" ||
    cookieStore.get("sidebar_state") === undefined;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 14)",
          "--content-padding": "calc(var(--spacing) * 4)",
          "--content-margin": "calc(var(--spacing) * 1.5)",
          "--content-full-height":
            "calc(100vh - var(--header-height) - (var(--content-padding) * 2) - (var(--content-margin) * 2))"
        } as React.CSSProperties
      }
    >
      {/* The assistant docked beside every page; its open/closed state and width come from
          cookies so it loads the way it was left. */}
      <ChatDockProvider
        defaultOpen={parseDockOpen(cookieStore.get(CHAT_DOCK_OPEN_COOKIE)?.value)}
        defaultWidth={parseDockWidth(cookieStore.get(CHAT_DOCK_WIDTH_COOKIE)?.value)}
      >
        <AppTours initialSeen={toursSeen}>
          <AppSidebar user={{ name, email, image }} />
          {/* From 1024px the page scrolls in its own area under the header, so its
              scrollbar sits beside the page, below the header line, and the docked
              assistant stays outside it, like a browser's side panel. Below that the
              document scrolls as usual. The inset sidebar variant puts an 8px margin
              around the page card; --inset-gap takes it off the height so the document
              is exactly one screen. */}
          <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:[--inset-gap:1rem] lg:h-[calc(100svh-var(--inset-gap,0px))] lg:overflow-hidden">
            <SiteHeader />
            <div
              data-slot="page-scroller"
              className="bg-background flex flex-1 flex-col scroll-pt-(--content-padding) lg:min-h-0 lg:overflow-y-auto"
            >
              <div className="@container/main p-(--content-padding) pb-[calc(var(--content-padding)+env(safe-area-inset-bottom))] xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto">
                {children}
              </div>
            </div>
          </SidebarInset>
          <ChatDock />
          {/* Back/forward return to where each page was, inside the page scroller. */}
          <React.Suspense>
            <PageScrollRestoration selector='[data-slot="page-scroller"]' />
          </React.Suspense>
        </AppTours>
      </ChatDockProvider>
    </SidebarProvider>
  );
}

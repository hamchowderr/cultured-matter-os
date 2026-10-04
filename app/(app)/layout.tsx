import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { SiteHeader } from "@/components/layout/header";
import { getUserSettings } from "@/actions/server";
import { AppTours } from "@/components/tours/app-tours";
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
      <AppTours initialSeen={toursSeen}>
        <AppSidebar user={{ name, email, image }} />
        <SidebarInset>
          <SiteHeader />
          <div className="bg-background flex flex-1 flex-col">
            <div className="@container/main p-(--content-padding) xl:group-data-[theme-content-layout=centered]/layout:container xl:group-data-[theme-content-layout=centered]/layout:mx-auto">
              {children}
            </div>
          </div>
        </SidebarInset>
      </AppTours>
    </SidebarProvider>
  );
}

"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { type Layout } from "react-resizable-panels";
import { useMailStore } from "../use-mail";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";

import { MailDisplay } from "./mail-display";
import { MailList } from "./mail-list";
import { type Mail } from "../data";
import { NavDesktop } from "./nav-desktop";
import { NavMobile } from "./nav-mobile";
import { MailDisplayMobile } from "./mail-display-mobile";
import { cn } from "@/lib/utils";

const DEFAULT_LAYOUT: Layout = {
  "left-panel": 16,
  "middle-panel": 30,
  "right-panel": 54
};

export function Mail({
  mails,
  defaultLayout = DEFAULT_LAYOUT,
  cookieID,
  defaultCollapsed,
  collapsedCookieID
}: {
  mails: Mail[];
  defaultLayout?: Layout;
  cookieID: string;
  defaultCollapsed: boolean;
  collapsedCookieID: string;
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const isMobile = useIsMobile();
  const { selectedMail } = useMailStore();
  const [tab, setTab] = React.useState("all");

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        id={cookieID}
        onLayoutChange={(layout) => {
          document.cookie = `${cookieID}=${JSON.stringify(layout)}; path=/;`;
        }}
        className="items-stretch">
        <ResizablePanel
          id="left-panel"
          hidden={isMobile}
          collapsedSize={`4%`}
          collapsible={true}
          minSize="15%"
          maxSize="20%"
          onResize={(panelSize) => {
            if (panelSize.asPercentage < 14) {
              setIsCollapsed(true);
              document.cookie = `${collapsedCookieID}=${JSON.stringify(true)}`;
            } else {
              setIsCollapsed(false);
              document.cookie = `${collapsedCookieID}=${JSON.stringify(false)}`;
            }
          }}
          className={cn(isCollapsed && "max-w-[50px] transition-all duration-1000 ease-in-out")}>
          <NavDesktop isCollapsed={isCollapsed} />
        </ResizablePanel>
        <ResizableHandle hidden={isMobile} withHandle />
        <ResizablePanel id="middle-panel" minSize="20%">
          <Tabs
            defaultValue="all"
            className="flex h-full flex-col gap-0"
            onValueChange={(value) => setTab(value)}>
            <div className="flex items-center px-4 py-2">
              <div className="flex items-center gap-2">
                {isMobile && <NavMobile />}
                <h1 className="text-xl font-bold">Inbox</h1>
              </div>
              <TabsList className="ml-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/59 p-4 backdrop-blur-md">
              <form>
                <InputGroup>
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput placeholder="Search" />
                </InputGroup>
              </form>
            </div>
            <div className="min-h-0">
              <MailList
                items={
                  tab === "all" ? mails : mails.filter((item) => item.read === (tab === "read"))
                }
              />
            </div>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle hidden={isMobile} withHandle />
        <ResizablePanel id="right-panel" hidden={isMobile} minSize="30%">
          {isMobile ? (
            <MailDisplayMobile mail={mails.find((item) => item.id === selectedMail?.id) || null} />
          ) : (
            <MailDisplay mail={mails.find((item) => item.id === selectedMail?.id) || null} />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}

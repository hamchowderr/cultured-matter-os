"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type Layout } from "react-resizable-panels";
import { toast } from "sonner";

import { createCapture } from "@/actions/server";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { IphonePanel } from "../iphone-panel";
import { type Capture, KIND_LABEL, type Project, useInboxStore } from "../use-inbox";
import { CaptureDisplay } from "./capture-display";
import { CaptureDisplayMobile } from "./capture-display-mobile";
import { CaptureList } from "./capture-list";

type Tab = "sort" | "filed";

const DEFAULT_LAYOUT: Layout = {
  "list-panel": 40,
  "display-panel": 60
};

function matches(c: Capture, q: string) {
  if (!q) return true;
  const hay = [c.body, c.kind ? KIND_LABEL[c.kind] : "", c.projectName ?? "", c.tier ? `tier ${c.tier}` : ""]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((word) => hay.includes(word));
}

// Adapted from the kit's mail app: the folder nav and account switcher are gone, the middle
// panel lists captures and the right panel is the reading pane with the filing controls.
export function Inbox({
  toSort,
  filed,
  unfiled,
  projects,
  initialTab,
  defaultLayout = DEFAULT_LAYOUT,
  cookieID
}: {
  toSort: Capture[];
  filed: Capture[];
  unfiled: number;
  projects: Project[];
  initialTab: Tab;
  defaultLayout?: Layout;
  cookieID: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { selectedId, setSelectedId } = useInboxStore();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [query, setQuery] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const all = tab === "filed" ? filed : toSort;
  const items = React.useMemo(() => all.filter((c) => matches(c, query.trim())), [all, query]);
  const selected = [...toSort, ...filed].find((c) => c.id === selectedId) ?? null;

  // Start with the newest item open on a wide screen; keep the pane empty on a phone.
  React.useEffect(() => {
    if (!isMobile && !selectedId && items[0]) setSelectedId(items[0].id);
  }, [isMobile]);

  function changeTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "filed") url.searchParams.set("view", "filed");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
    const first = (next === "filed" ? filed : toSort)[0];
    setSelectedId(isMobile ? null : (first?.id ?? null));
  }

  const refresh = () => startTransition(() => router.refresh());

  // After filing from "To sort", move on to the next item still waiting.
  function onFiled(id: string) {
    if (tab === "sort") {
      const i = items.findIndex((c) => c.id === id);
      const next = items[i + 1] ?? items[i - 1];
      setSelectedId(isMobile ? null : (next?.id ?? null));
    }
    refresh();
  }

  function onCaptured(capture: Capture) {
    if (tab !== "sort") changeTab("sort");
    setQuery("");
    if (!isMobile) setSelectedId(capture.id);
    refresh();
  }

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        id={cookieID}
        onLayoutChange={(layout) => {
          document.cookie = `${cookieID}=${JSON.stringify(layout)}; path=/;`;
        }}
        className={cn("items-stretch transition-opacity", pending && "opacity-80")}
      >
        <ResizablePanel id="list-panel" minSize="25%">
          <Tabs
            value={tab}
            className="flex h-full flex-col gap-0"
            onValueChange={(value) => changeTab(value as Tab)}
          >
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger value="sort">
                  To sort <span className="text-muted-foreground ml-1 tabular-nums">{unfiled}</span>
                </TabsTrigger>
                <TabsTrigger value="filed">Filed</TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/59 space-y-3 p-4 backdrop-blur-md">
              <QuickCapture onCaptured={onCaptured} />
              <form onSubmit={(e) => e.preventDefault()}>
                <InputGroup>
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search"
                    aria-label="Search the inbox"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </InputGroup>
              </form>
            </div>
            <div className="min-h-0 flex-1">
              <CaptureList
                items={items}
                empty={
                  query.trim()
                    ? "Nothing matches that search."
                    : tab === "filed"
                      ? "Nothing filed yet. Items you sort show up here."
                      : "Everything is sorted. Capture something above."
                }
              />
            </div>
            <div className="border-t p-3">
              <IphonePanel />
            </div>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle hidden={isMobile} withHandle />
        <ResizablePanel id="display-panel" hidden={isMobile} minSize="30%">
          {!isMobile && (
            <CaptureDisplay capture={selected} projects={projects} onFiled={onFiled} />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      {isMobile && (
        <CaptureDisplayMobile capture={selected} projects={projects} onFiled={onFiled} />
      )}
    </TooltipProvider>
  );
}

function QuickCapture({ onCaptured }: { onCaptured: (capture: Capture) => void }) {
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function capture() {
    if (!body.trim() || saving) return;
    setSaving(true);
    const result = await createCapture({ body: body.trim() });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    setBody("");
    toast.success("Captured");
    onCaptured({ ...result.data, projectName: null });
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        capture();
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            capture();
          }
        }}
        rows={2}
        className="min-h-16"
        placeholder="What’s on your mind? A lead, an idea, a link, something to do…"
        aria-label="Capture"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Ctrl + Enter to capture</span>
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          Capture
        </Button>
      </div>
    </form>
  );
}

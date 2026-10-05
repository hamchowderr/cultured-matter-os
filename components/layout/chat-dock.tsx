"use client";

import { Maximize2Icon, MessageCircleIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { ChatPanel } from "@/components/chat-panel/chat-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { suggestionsFor } from "@/lib/chat-suggestions";
import { cn } from "@/lib/utils";
import {
  CHAT_DOCK_MAX,
  CHAT_DOCK_MIN,
  CHAT_DOCK_OPEN_COOKIE,
  CHAT_DOCK_WIDTH_COOKIE,
  clampDockWidth
} from "@/lib/chat-dock";

// The assistant docked on the right of every page, like a browser's assistant side panel:
// the mastra-chat-kit ChatPanel in a full-height column beside the header and the page,
// which narrows to fit. Open the first time; open/closed and the width are kept in
// cookies the layout reads on the server, so it loads the way it was left. It stays
// mounted while you move between pages, so the conversation carries on. Below 1024px it
// is a full-screen sheet instead. /chat is the full chat, so the dock steps aside there.

const DESKTOP = "(min-width: 1024px)";

type ChatDockState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  desktop: boolean;
};
const ChatDockContext = React.createContext<ChatDockState | null>(null);

function useChatDock() {
  const ctx = React.useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used inside ChatDockProvider");
  return ctx;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function ChatDockProvider({
  defaultOpen,
  defaultWidth,
  children
}: {
  defaultOpen: boolean;
  defaultWidth: number;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [width, setWidthState] = React.useState(defaultWidth);
  // Assume a desktop until the browser says otherwise: the dock column is CSS-hidden
  // below 1024px anyway, so a phone never sees it flash.
  const [desktop, setDesktop] = React.useState(true);

  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const value = React.useMemo<ChatDockState>(
    () => ({
      open,
      setOpen: (next) => {
        setOpenState(next);
        setCookie(CHAT_DOCK_OPEN_COOKIE, String(next));
      },
      sheetOpen,
      setSheetOpen,
      width,
      setWidth: (next) => {
        const w = clampDockWidth(next);
        setWidthState(w);
        setCookie(CHAT_DOCK_WIDTH_COOKIE, String(w));
      },
      desktop
    }),
    [open, sheetOpen, width, desktop]
  );
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

// The header button: docks or undocks the panel on a desktop, opens the sheet on a phone.
export function ChatButton() {
  const { open, setOpen, desktop, setSheetOpen } = useChatDock();
  if (usePathname() === "/chat") return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={desktop && open ? "Close chat" : "Chat"}
      aria-pressed={desktop ? open : undefined}
      data-tour-step-id="tour-chat"
      onClick={() => (desktop ? setOpen(!open) : setSheetOpen(true))}
    >
      <MessageCircleIcon />
    </Button>
  );
}

function PanelActions({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Button variant="ghost" size="icon" className="size-8" asChild>
        <Link href="/chat" aria-label="Open the full chat">
          <Maximize2Icon className="size-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Close chat"
        onClick={onClose}
      >
        <XIcon className="size-4" />
      </Button>
    </>
  );
}

// The panel's composer in the app's own look: a rounder card, and the microphone as a
// quiet icon button like the attach button beside it (the kit draws it as a filled
// primary circle). While it listens it keeps the kit's red, so recording stays obvious.
const COMPOSER_LOOK = cn(
  "[&_form_[data-slot=input-group]]:rounded-xl",
  "[&_button[aria-label=Dictate]:not(.bg-destructive)]:bg-transparent",
  "[&_button[aria-label=Dictate]:not(.bg-destructive)]:text-muted-foreground",
  "[&_button[aria-label=Dictate]:not(.bg-destructive):hover]:bg-accent",
  "[&_button[aria-label=Dictate]:not(.bg-destructive):hover]:text-foreground"
);

function AssistantPanel({ onClose, className }: { onClose: () => void; className?: string }) {
  // Suggestions for the page she is on: it stays mounted across pages, so they follow her.
  const suggestions = suggestionsFor(usePathname());
  return (
    <ChatPanel
      title="Assistant"
      greeting={{
        title: "How can I help you today?",
        description: "Ask about your grants, Radar, people or tasks."
      }}
      suggestions={suggestions}
      actions={<PanelActions onClose={onClose} />}
      className={cn(COMPOSER_LOOK, className ?? "min-h-0 flex-1")}
    />
  );
}

// Drag the dock's left edge to resize it (or focus the edge and use the arrow keys).
function ResizeEdge() {
  const { width, setWidth } = useChatDock();
  const [dragging, setDragging] = React.useState(false);
  const start = React.useRef({ x: 0, width });
  const live = React.useRef(width);
  const [preview, setPreview] = React.useState<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width };
    live.current = width;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // Leave the page at least ~35rem beside the left sidebar, however far she drags.
    const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar-gap"]')?.offsetWidth ?? 0;
    const room = window.innerWidth - sidebar - 560;
    live.current = clampDockWidth(
      Math.min(room, start.current.width + (start.current.x - e.clientX))
    );
    setPreview(live.current);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    setPreview(null);
    setWidth(live.current);
  };

  // While dragging, the column follows the pointer without writing a cookie each move.
  React.useEffect(() => {
    if (preview === null) return;
    const root = document.documentElement;
    root.style.setProperty("--chat-dock-width", `${preview}px`);
    root.classList.add("chat-dock-dragging");
    return () => {
      root.style.removeProperty("--chat-dock-width");
      root.classList.remove("chat-dock-dragging");
    };
  }, [preview]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chat"
      aria-valuemin={CHAT_DOCK_MIN}
      aria-valuemax={CHAT_DOCK_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setWidth(width + 24);
        if (e.key === "ArrowRight") setWidth(width - 24);
      }}
      // An 8px grab area starting on the border (the column clips anything outside it).
      // The line drawn over the border only shows on hover, focus or drag, so the single
      // divider stays a single 1px line otherwise.
      className="after:bg-ring absolute inset-y-0 -left-px z-20 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-0 after:w-0.5 after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100 data-[dragging=true]:after:opacity-100"
      data-dragging={dragging}
    />
  );
}

export function ChatDock() {
  const { open, setOpen, sheetOpen, setSheetOpen, width, desktop } = useChatDock();
  const onChat = usePathname() === "/chat";
  const shown = open && !onChat;

  return (
    <>
      {/* The docked column, the right-hand mirror of the left sidebar: the sidebar
          surface, one border-l as the only divider, and its header row on the app
          header's line. Its width animates open and closed the way the left sidebar
          does (no animation when reduced motion is asked for, or while dragging). It
          stays mounted when closed or on /chat, so the conversation survives, and it
          is never shown below 1024px. */}
      <aside
        aria-label="Assistant"
        aria-hidden={!shown}
        inert={!shown}
        data-state={shown ? "open" : "closed"}
        style={
          {
            // Never so wide that the page gets less than ~35rem beside the left sidebar.
            "--chat-dock-w": `max(${CHAT_DOCK_MIN}px, min(var(--chat-dock-width, ${width}px), calc(100vw - var(--sidebar-width) - 35rem)))`,
            width: shown ? "var(--chat-dock-w)" : 0
          } as React.CSSProperties
        }
        className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none lg:block [.chat-dock-dragging_&]:transition-none"
      >
        {desktop && (
          // A fixed-width inner column, so the panel never reflows while the width animates.
          <div
            className="relative flex h-full flex-col border-l"
            style={{ width: "var(--chat-dock-w)" }}
          >
            <ResizeEdge />
            {/* Transparent, so the column's sidebar surface shows; the header row takes the
                app header's height, so the two bottom borders run on one line. */}
            <AssistantPanel
              onClose={() => setOpen(false)}
              className="min-h-0 flex-1 bg-transparent [--chat-panel-header-height:var(--header-height)]"
            />
          </div>
        )}
      </aside>

      {!desktop && !onChat && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          {/* Full screen, so no edge border, and clear of the notch and the home bar. Focus
              goes to the sheet itself rather than its first button (no focus ring on
              History) or the textarea (no keyboard popping up on a phone). */}
          <SheetContent
            side="right"
            showCloseButton={false}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement | null)?.focus();
            }}
            className="gap-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:w-full data-[side=right]:sm:max-w-none"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Assistant</SheetTitle>
              <SheetDescription>
                Ask about your work. Changes wait for your approval.
              </SheetDescription>
            </SheetHeader>
            <AssistantPanel onClose={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

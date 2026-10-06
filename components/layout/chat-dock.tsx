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
import { useRefreshAfterWrites } from "@/hooks/use-refresh-after-writes";
import { suggestionsFor } from "@/lib/chat-suggestions";
import type { ToolEnd } from "@/lib/refresh-after-writes";
import { cn } from "@/lib/utils";
import {
  CHAT_DOCK_MIN,
  CHAT_DOCK_OPEN_COOKIE,
  CHAT_DOCK_WIDTH_COOKIE,
  clampDockWidth,
  dockCap,
  dockWidthCss
} from "@/lib/chat-dock";

// The assistant docked on the right of every page, like a browser's assistant side panel:
// the mastra-chat-kit ChatPanel in a full-height column beside the header and the page,
// which narrows to fit. Open the first time; open/closed and the width are kept in
// cookies the layout reads on the server, so it loads the way it was left. It stays
// mounted while you move between pages, so the conversation carries on. Below 1024px it
// is a full-screen sheet instead. /chat is the full chat, so the dock steps aside there.

const DESKTOP = "(min-width: 1024px)";

type ChatDockState = {
  // False when the server has no agent configured (lib/chat-enabled.ts): no button, no dock.
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  // null until the browser has been asked; the panel mounts only once it is known, so a
  // phone never loads the hidden dock (and its /goal, /om, /schedules, /threads calls).
  desktop: boolean | null;
  // The header's chat button, so closing the dock can hand focus back to it.
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  // After an approved write by the assistant, refresh the page beside the chat.
  onToolEnd: (tool: ToolEnd) => void;
};
const ChatDockContext = React.createContext<ChatDockState | null>(null);

/**
 * Whether the assistant is available on this server. False outside the provider, so
 * nothing offers a chat that has no agent behind it.
 */
export function useChatEnabled(): boolean {
  return React.useContext(ChatDockContext)?.enabled ?? false;
}

function useChatDock() {
  const ctx = React.useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used inside ChatDockProvider");
  return ctx;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function ChatDockProvider({
  enabled,
  defaultOpen,
  defaultWidth,
  writeActions,
  children
}: {
  /** Whether the server has an agent configured (lib/chat-enabled.ts, read in the layout). */
  enabled: boolean;
  defaultOpen: boolean;
  defaultWidth: number;
  /** The app's write actions (lib/agent-actions): when one ends, the page refreshes. */
  writeActions: readonly string[];
  children: React.ReactNode;
}) {
  const onToolEnd = useRefreshAfterWrites(writeActions);
  const [open, setOpenState] = React.useState(defaultOpen);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [width, setWidthState] = React.useState(defaultWidth);
  const [desktop, setDesktop] = React.useState<boolean | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  // Read before the first paint after hydration, so on a desktop the panel fills the
  // server-rendered column at once.
  React.useLayoutEffect(() => {
    const mql = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Stable setters, so a toggle changes only the state that changed.
  const setOpen = React.useCallback((next: boolean) => {
    setOpenState(next);
    setCookie(CHAT_DOCK_OPEN_COOKIE, String(next));
  }, []);
  // Clamped to the same cap as the column's CSS, so the cookie never holds a width the
  // dock can't show in this window.
  const setWidth = React.useCallback((next: number) => {
    const w = Math.min(clampDockWidth(next), dockCap(window.innerWidth));
    setWidthState(w);
    setCookie(CHAT_DOCK_WIDTH_COOKIE, String(w));
  }, []);

  const value = React.useMemo<ChatDockState>(
    () => ({
      enabled,
      open,
      setOpen,
      sheetOpen,
      setSheetOpen,
      width,
      setWidth,
      desktop,
      buttonRef,
      onToolEnd
    }),
    [enabled, open, setOpen, sheetOpen, width, setWidth, desktop, onToolEnd]
  );
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

// The header button: docks or undocks the panel on a desktop, opens the sheet on a phone.
export function ChatButton() {
  const { enabled, open, setOpen, desktop, setSheetOpen, buttonRef } = useChatDock();
  const onChat = usePathname() === "/chat";
  if (!enabled || onChat) return null;
  return (
    <Button
      ref={buttonRef}
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

const GREETING = {
  title: "How can I help you today?",
  description: "Ask about your grants, Radar, people or tasks."
};

// Memoised with stable props, so opening, closing or resizing the dock (or toggling the
// left sidebar) doesn't re-render the conversation; only a new page (its suggestions)
// or the chat itself does.
const AssistantPanel = React.memo(function AssistantPanel({
  onClose,
  onToolEnd,
  className
}: {
  onClose: () => void;
  onToolEnd: (tool: ToolEnd) => void;
  className?: string;
}) {
  // Suggestions for the page she is on: it stays mounted across pages, so they follow her.
  const pathname = usePathname();
  const suggestions = React.useMemo(() => suggestionsFor(pathname), [pathname]);
  const actions = React.useMemo(() => <PanelActions onClose={onClose} />, [onClose]);
  return (
    <ChatPanel
      title="Assistant"
      greeting={GREETING}
      suggestions={suggestions}
      actions={actions}
      onToolEnd={onToolEnd}
      className={cn(COMPOSER_LOOK, className ?? "min-h-0 flex-1")}
    />
  );
});

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
    // The same cap as the column's CSS: the page keeps ~35rem beside the sidebar.
    live.current = Math.min(
      clampDockWidth(start.current.width + (start.current.x - e.clientX)),
      dockCap(window.innerWidth)
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

  // What the column actually shows: the stored width under this window's cap.
  const [cap, setCap] = React.useState<number | null>(null);
  React.useEffect(() => {
    const measure = () => setCap(dockCap(window.innerWidth));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const shown = cap === null ? width : Math.min(width, cap);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chat"
      aria-valuemin={CHAT_DOCK_MIN}
      aria-valuemax={cap ?? undefined}
      aria-valuenow={preview ?? shown}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Arrow keys step from what is shown; setWidth clamps to the same cap.
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setWidth(shown + 24);
        if (e.key === "ArrowRight") setWidth(shown - 24);
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
  const { enabled, open, setOpen, sheetOpen, setSheetOpen, width, desktop, buttonRef, onToolEnd } =
    useChatDock();
  const onChat = usePathname() === "/chat";
  const shown = open && !onChat;

  // The dock's X: close it and hand focus back to the header's chat button (the column
  // goes inert, so focus would otherwise be lost).
  const closeDock = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, [setOpen, buttonRef]);
  const closeSheet = React.useCallback(() => setSheetOpen(false), [setSheetOpen]);

  // No agent on this server: no dock at all (lib/chat-enabled.ts).
  if (!enabled) return null;

  return (
    <>
      {/* The docked column, the right-hand mirror of the left sidebar: the sidebar
          surface, one border-l as the only divider, and its header row on the app
          header's line (with the inset sidebar variant the page card sits 8px down, so
          the column does too). Its width animates open and closed the way the left sidebar
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
            "--chat-dock-w": dockWidthCss(width),
            width: shown ? "var(--chat-dock-w)" : 0
          } as React.CSSProperties
        }
        className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none lg:block lg:peer-data-[variant=inset]:pt-2 [.chat-dock-dragging_&]:transition-none"
      >
        {desktop !== false && (
          // A fixed-width inner column, so the panel never reflows while the width animates.
          <div
            className="relative flex h-full flex-col border-l"
            style={{ width: "var(--chat-dock-w)" }}
          >
            {desktop ? (
              <>
                <ResizeEdge />
                {/* Transparent, so the column's sidebar surface shows; the header row takes
                    the app header's height, so the two bottom borders run on one line. */}
                <AssistantPanel
                  onClose={closeDock}
                  onToolEnd={onToolEnd}
                  className="min-h-0 flex-1 bg-transparent [--chat-panel-header-height:var(--header-height)]"
                />
              </>
            ) : (
              // Server render and hydration: the panel's header row, so the column and the
              // header line are there from the first paint.
              <div className="flex h-(--header-height) shrink-0 items-center border-b px-3 text-sm font-medium">
                Assistant
              </div>
            )}
          </div>
        )}
      </aside>

      {desktop === false && !onChat && (
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
            <AssistantPanel onClose={closeSheet} onToolEnd={onToolEnd} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

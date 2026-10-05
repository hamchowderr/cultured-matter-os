"use client";

import { Maximize2Icon, MessageCircleIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { MinimalChat } from "@/components/chat-minimal/minimal-chat";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

// The chat panel on every page: the mastra-chat-kit MinimalChat, opened from the header.
// From 1024px it docks on the right beside the page; narrower, it is a full-screen sheet.
// /chat is the full chat already, so the button and the panel step aside there.

const DESKTOP = "(min-width: 1024px)";

type ChatDockState = { open: boolean; setOpen: (open: boolean) => void };
const ChatDockContext = React.createContext<ChatDockState | null>(null);

function useChatDock() {
  const ctx = React.useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used inside ChatDockProvider");
  return ctx;
}

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function ChatButton() {
  const { open, setOpen } = useChatDock();
  if (usePathname() === "/chat") return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={open ? "Close chat" : "Chat"}
      aria-pressed={open}
      data-tour-step-id="tour-chat"
      onClick={() => setOpen(!open)}
    >
      <MessageCircleIcon />
    </Button>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-(--header-height) shrink-0 items-center gap-1 border-b px-3">
      <p className="flex-1 font-medium">Chat</p>
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href="/chat" aria-label="Open the full chat" onClick={onClose}>
          <Maximize2Icon />
        </Link>
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Close chat" onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  );
}

export function ChatDock() {
  const { open, setOpen } = useChatDock();
  const desktop = useIsDesktop();
  const pathname = usePathname();
  if (pathname === "/chat") return null;
  const close = () => setOpen(false);

  if (desktop) {
    if (!open) return null;
    return (
      <aside
        aria-label="Chat"
        className="bg-background sticky top-0 flex h-svh w-[400px] shrink-0 flex-col border-l"
      >
        <PanelHeader onClose={close} />
        <MinimalChat className="min-h-0 flex-1" />
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-full data-[side=right]:sm:max-w-none"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Chat</SheetTitle>
          <SheetDescription>Ask about your work. Changes wait for your approval.</SheetDescription>
        </SheetHeader>
        <PanelHeader onClose={close} />
        <MinimalChat className="min-h-0 flex-1" />
      </SheetContent>
    </Sheet>
  );
}

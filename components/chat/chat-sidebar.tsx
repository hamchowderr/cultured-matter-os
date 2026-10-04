"use client";

import { Maximize2Icon, MessageCircleIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChatPanel } from "@/components/chat/chat-panel";
import { useChatState } from "@/components/chat/chat-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

// The header button that opens the chat. Hidden on /chat, which is the chat already.
export function ChatButton() {
  const { setOpen } = useChatState();
  const pathname = usePathname();
  if (pathname === "/chat") return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Chat"
      data-tour-step-id="tour-chat"
      onClick={() => setOpen(true)}
    >
      <MessageCircleIcon />
    </Button>
  );
}

// The right-hand chat sidebar, on every page. On a phone it fills the screen.
export function ChatSidebar() {
  const { open, setOpen, newThread } = useChatState();
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:sm:w-[420px] data-[side=right]:sm:max-w-[420px]"
      >
        <SheetHeader className="flex-row items-center gap-1 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <SheetTitle>Chat</SheetTitle>
            <SheetDescription className="sr-only">
              Ask about your data. Changes wait for your approval.
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={newThread}>
            <PlusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/chat" aria-label="Open full screen" onClick={() => setOpen(false)}>
              <Maximize2Icon />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </SheetHeader>
        <ChatPanel className="min-h-0 flex-1" onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

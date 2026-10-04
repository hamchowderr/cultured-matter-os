"use client";

import { ListIcon } from "lucide-react";
import { useState } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { useChatState } from "@/components/chat/chat-provider";
import { ThreadList, useThreads } from "@/components/chat/thread-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

// The full chat screen: her conversations beside the chat, laid out like the UI kit's AI chat
// app. On a phone the list moves into a sheet.
export function ChatScreen() {
  const [listOpen, setListOpen] = useState(false);
  const { threadId } = useChatState();
  const { threads } = useThreads();
  const title = threads?.find((t) => t.id === threadId)?.title ?? "New chat";

  return (
    <div className="flex h-[calc(100dvh-var(--header-height)-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--content-padding)*2)] min-h-0 min-w-0 overflow-hidden rounded-lg border">
      <aside className="hidden w-72 shrink-0 border-e md:flex" data-tour-step-id="chat-threads">
        <ThreadList className="w-full" />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setListOpen(true)}>
            <ListIcon />
            Chats
          </Button>
          <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
        </header>
        <ChatPanel className="min-h-0 flex-1" />
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Chats</SheetTitle>
            <SheetDescription className="sr-only">Your conversations</SheetDescription>
          </SheetHeader>
          <ThreadList className="min-h-0 flex-1" onPick={() => setListOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

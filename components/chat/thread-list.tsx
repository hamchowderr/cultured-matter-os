"use client";

import { isToday, isYesterday, subDays } from "date-fns";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useChatState } from "@/components/chat/chat-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatThread } from "@/lib/chat/server";
import { cn } from "@/lib/utils";

// Her conversations, grouped by day like the UI kit's AI chat sidebar.

function groupOf(updatedAt: string, now = new Date()) {
  const d = new Date(updatedAt);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (d > subDays(now, 7)) return "Last 7 days";
  return "Older";
}

export function useThreads() {
  const { threadsVersion, threadId } = useChatState();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/chat/threads")
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((d: { threads: ChatThread[] }) => live && setThreads(d.threads))
      .catch(() => live && setThreads([]));
    return () => {
      live = false;
    };
  }, [threadsVersion, threadId, reload]);
  return { threads, refresh: () => setReload((n) => n + 1) };
}

export function ThreadList({ onPick, className }: { onPick?: () => void; className?: string }) {
  const { threadId, openThread, newThread } = useChatState();
  const { threads, refresh } = useThreads();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (threads ?? []).filter((t) => !q || t.title.toLowerCase().includes(q));
    const out = new Map<string, ChatThread[]>();
    for (const t of shown) {
      const g = groupOf(t.updatedAt);
      out.set(g, [...(out.get(g) ?? []), t]);
    }
    return [...out.entries()];
  }, [threads, query]);

  async function remove(id: string) {
    const res = await fetch(`/api/chat/threads/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete that conversation");
    if (id === threadId) newThread();
    refresh();
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex flex-col gap-2 border-b p-3">
        <Button
          onClick={() => {
            newThread();
            onPick?.();
          }}
        >
          <PlusIcon />
          New chat
        </Button>
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="pl-8 text-base md:text-sm"
          />
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" aria-label="Conversations">
        {threads === null && <p className="text-muted-foreground text-sm">Loading…</p>}
        {threads?.length === 0 && (
          <p className="text-muted-foreground text-sm">No conversations yet.</p>
        )}
        {threads && threads.length > 0 && groups.length === 0 && (
          <p className="text-muted-foreground text-sm">No conversations match.</p>
        )}
        {groups.map(([title, list]) => (
          <div key={title}>
            <h3 className="text-muted-foreground mb-1 px-2 text-xs">{title}</h3>
            <ul className="space-y-0.5">
              {list.map((t) => (
                <li key={t.id} className="group flex min-w-0 items-center">
                  <button
                    type="button"
                    onClick={() => {
                      openThread(t.id);
                      onPick?.();
                    }}
                    aria-current={t.id === threadId ? "true" : undefined}
                    className={cn(
                      "hover:bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm",
                      t.id === threadId && "bg-muted font-medium"
                    )}
                  >
                    {t.title}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${t.title}`}
                    className="shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    onClick={() => void remove(t.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

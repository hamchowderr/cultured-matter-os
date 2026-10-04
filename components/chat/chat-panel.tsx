"use client";

import { type Chat, useChat } from "@ai-sdk/react";
import { isToolUIPart, type UIMessage } from "ai";
import { XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Approval } from "@/actions/schemas";
import { listApprovals } from "@/actions/server";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { useChatState } from "@/components/chat/chat-provider";
import { ApprovalStatuses, ChatToolPart, toolNameOf } from "@/components/chat/chat-tool-part";
import { Button } from "@/components/ui/button";
import { pageName } from "@/lib/chat/page-context";
import { cn } from "@/lib/utils";

// The conversation and its composer. The header sidebar and the /chat screen both render this
// over the same chat state, so they show the same thread.

function suggestionsFor(path: string, record: { type: string; label?: string } | null): string[] {
  if (record?.type === "company") {
    return ["Who can introduce me to this company?", "Shortlist this company"];
  }
  if (record?.type === "contact") return ["Which companies can this person introduce me to?"];
  if (path.startsWith("/radar"))
    return ["What's new on Radar this week?", "Show me shortlisted companies"];
  if (path.startsWith("/grants")) return ["Which grants close soon?", "What am I applying for?"];
  if (path.startsWith("/people"))
    return ["Who works at a beauty brand?", "Who is on the newsletter?"];
  if (path.startsWith("/projects"))
    return ["What's overdue?", "Add a task to follow up with Jordan"];
  return ["What needs me today?", "Which grants close soon?", "What's new on Radar this week?"];
}

// The approval ids in a conversation, so cards decided elsewhere show their real status.
function approvalIds(messages: UIMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (!isToolUIPart(p) || p.state !== "output-available") continue;
      const out = p.output as { approval?: { id?: string } } | null;
      if (toolNameOf(p).startsWith("propose") && out?.approval?.id) ids.push(out.approval.id);
    }
  }
  return ids;
}

function useApprovalStatuses(ids: string[]) {
  const [statuses, setStatuses] = useState<Record<string, Approval["status"]>>({});
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let live = true;
    void Promise.all(
      (["approved", "rejected"] as const).map((status) => listApprovals({ status, limit: 200 }))
    ).then((results) => {
      if (!live) return;
      const next: Record<string, Approval["status"]> = {};
      for (const r of results) {
        if (r.ok) for (const a of r.data.approvals) if (ids.includes(a.id)) next[a.id] = a.status;
      }
      setStatuses(next);
    });
    return () => {
      live = false;
    };
  }, [key]);
  return statuses;
}

const subscribeNothing = () => () => {};

type PanelProps = {
  className?: string;
  // Called when a card link leaves the chat, so the sidebar closes.
  onNavigate?: () => void;
};

export function ChatPanel(props: PanelProps) {
  const { chat, loading } = useChatState();
  // The saved conversation is only known in the browser, so the panel renders there only.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
  if (!mounted || !chat) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col p-4", props.className)}>
        <Shimmer className="text-muted-foreground text-sm">Opening…</Shimmer>
      </div>
    );
  }
  return <ChatConversation key={chat.id} chat={chat} loading={loading} {...props} />;
}

function ChatConversation({
  chat,
  loading,
  className,
  onNavigate
}: PanelProps & { chat: Chat<UIMessage>; loading: boolean }) {
  const { record, setRecord } = useChatState();
  const { messages, sendMessage, status, stop, error, clearError } = useChat({ chat });
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const statuses = useApprovalStatuses(useMemo(() => approvalIds(messages), [messages]));

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (error) clearError();
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const last = messages.at(-1);
  const waiting = busy && (last?.role === "user" || (last?.parts.length ?? 0) === 0);

  return (
    <ApprovalStatuses.Provider value={statuses}>
      <div className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}>
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-2xl gap-5 p-4">
            {loading && <Shimmer className="text-muted-foreground text-sm">Opening…</Shimmer>}
            {!loading && messages.length === 0 && (
              <div className="flex flex-col gap-4 py-6">
                <div className="space-y-1">
                  <p className="font-medium">What can I help with?</p>
                  <p className="text-muted-foreground text-sm">
                    Ask about Radar, grants, people or your tasks. I&apos;ll ask before I change
                    anything.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  {suggestionsFor(pathname, record).map((s) => (
                    <Suggestion
                      key={s}
                      suggestion={s}
                      onClick={send}
                      className="h-auto max-w-full py-1.5 text-left whitespace-normal"
                    />
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className="w-full group-[.is-user]:w-fit">
                  {m.parts.map((part, i) => {
                    const key = `${m.id}-${i}`;
                    if (part.type === "text") {
                      return m.role === "user" ? (
                        <p key={key} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      ) : (
                        <MessageResponse key={key}>{part.text}</MessageResponse>
                      );
                    }
                    if (isToolUIPart(part)) {
                      return <ChatToolPart key={key} part={part} onNavigate={onNavigate} />;
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))}
            {waiting && <Shimmer className="text-muted-foreground text-sm">Thinking…</Shimmer>}
            {error && (
              <p className="text-destructive text-sm" role="alert">
                Sorry, something went wrong. Please try again.
              </p>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-2xl px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <PromptInput onSubmit={({ text }) => send(text)}>
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything…"
                aria-label="Message"
                // 16px keeps iOS from zooming in when she taps the box.
                className="min-h-12 text-base md:text-sm"
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-between gap-2">
              <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                {record ? (
                  <>
                    <span className="truncate">About: {record.label ?? `this ${record.type}`}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Don't use this record"
                      onClick={() => setRecord(null)}
                    >
                      <XIcon />
                    </Button>
                  </>
                ) : (
                  <span className="truncate">On {pageName(pathname)}</span>
                )}
              </span>
              <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </ApprovalStatuses.Provider>
  );
}

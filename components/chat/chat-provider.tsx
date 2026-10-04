"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { type PageContext, recordFromUrl } from "@/lib/chat/page-context";

// One chat state for the whole app, so the header sidebar and the /chat screen show the same
// conversation: a message started in the sidebar keeps streaming when she opens the full screen.

type ChatRecord = NonNullable<PageContext["record"]>;

type ChatState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  // The conversation on screen.
  threadId: string;
  // Null until the conversation she was last in has loaded.
  chat: Chat<UIMessage> | null;
  // True while an earlier conversation's messages load.
  loading: boolean;
  openThread: (id: string) => void;
  newThread: () => void;
  // The record she has open (a company, grant, contact…), sent with each message.
  record: ChatRecord | null;
  setRecord: (record: ChatRecord | null) => void;
  // Changes when a reply finishes, so thread lists refresh.
  threadsVersion: number;
};

const ChatContext = createContext<ChatState | null>(null);

const ACTIVE_KEY = "cmos-chat-thread";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<ChatRecord | null>(null);
  const [threadsVersion, setThreadsVersion] = useState(0);
  // Read at send time, so every message carries the page and record she has open right now.
  const recordRef = useRef<ChatRecord | null>(null);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  // A record belongs to the page it was opened on.
  const [recordPath, setRecordPath] = useState(pathname);
  if (recordPath !== pathname) {
    setRecordPath(pathname);
    setRecord(null);
  }

  // One Chat per conversation, kept while the app is open, so a reply keeps streaming when she
  // switches between the sidebar and the full screen.
  const [chats] = useState(() => new Map<string, Chat<UIMessage>>());
  const makeChat = useCallback(
    (id: string, messages: UIMessage[] = []) => {
      const chat = new Chat<UIMessage>({
        id,
        messages,
        transport: new DefaultChatTransport({
          api: "/api/chat",
          prepareSendMessagesRequest: ({ id: threadId, messages: all }) => {
            const path = window.location.pathname;
            const fromUrl = recordFromUrl(path, new URLSearchParams(window.location.search));
            const page: PageContext = { path, record: recordRef.current ?? fromUrl ?? null };
            return { body: { threadId, message: all.at(-1), page } };
          }
        }),
        onFinish: () => setThreadsVersion((v) => v + 1)
      });
      chats.set(id, chat);
      return chat;
    },
    [chats]
  );

  // Come back to the conversation she was last in. It loads after mount; until then the chat
  // is null and the panel shows that it is opening.
  const [threadId, setThreadId] = useState<string>(() => readActive() ?? newId());
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null);

  const load = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/chat/threads/${encodeURIComponent(id)}`);
        const { messages = [] } = res.ok ? await res.json() : {};
        return makeChat(id, messages);
      } catch {
        return makeChat(id);
      }
    },
    [makeChat]
  );

  useEffect(() => {
    const saved = readActive() === threadId;
    writeActive(threadId);
    let live = true;
    void (saved ? load(threadId) : Promise.resolve(makeChat(threadId))).then(
      (c) => live && setChat(c)
    );
    return () => {
      live = false;
    };
  }, []);

  // The conversation she asked for last; a slower load for an earlier pick is dropped.
  const wanted = useRef(threadId);
  const openThread = useCallback(
    async (id: string) => {
      wanted.current = id;
      writeActive(id);
      setThreadId(id);
      const next = chats.get(id) ?? (await load(id));
      if (wanted.current === id) setChat(next);
    },
    [chats, load]
  );

  const newThread = useCallback(() => {
    const id = newId();
    wanted.current = id;
    writeActive(id);
    setThreadId(id);
    setChat(makeChat(id));
  }, [makeChat]);

  const loading = !chat || chat.id !== threadId;

  const value = useMemo<ChatState>(
    () => ({
      open,
      setOpen,
      threadId,
      chat,
      loading,
      openThread: (id) => void openThread(id),
      newThread,
      record,
      setRecord,
      threadsVersion
    }),
    [open, threadId, chat, loading, openThread, newThread, record, threadsVersion]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatState(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatState must be used inside ChatProvider");
  return ctx;
}

// Call from a record's detail view so the chat knows what she is looking at. The record stays
// the chat's subject after the view closes, until she opens another or changes page.
export function useChatRecord(record: ChatRecord | null) {
  const ctx = useContext(ChatContext);
  const key = record ? `${record.type}:${record.id}:${record.label ?? ""}` : "";
  useEffect(() => {
    if (ctx && record) ctx.setRecord(record);
  }, [key]);
}

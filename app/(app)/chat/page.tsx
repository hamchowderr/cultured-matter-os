import { ChatSwitcher } from "@/components/chat/chat-switcher";
import { CHAT_SUGGESTIONS } from "@/lib/chat-suggestions";
import { generateMeta } from "@/lib/utils";

export async function generateMetadata() {
  return generateMeta({
    title: "Chat",
    description: "Ask about your grants, Radar, people and tasks."
  });
}

// The full mastra-chat-kit chat: conversations, the chat and the workbench. It drives the
// same session and threads as the chat panel in the header. It fills the space under the
// header; the agent has no files, terminal or browser, so the workbench keeps only Memory
// and Schedules, and the model picker and web search are off.
export default function ChatPage() {
  return (
    <div className="-m-(--content-padding) h-[calc(100svh-var(--header-height)-env(safe-area-inset-top))]">
      <ChatSwitcher
        className="h-full"
        workbenchTabs={["memory", "schedules"]}
        suggestions={CHAT_SUGGESTIONS}
        greeting={{ title: "What can I help with?", description: "Ask about your grants, Radar, people or tasks." }}
        models={false}
        webSearch={false}
      />
    </div>
  );
}

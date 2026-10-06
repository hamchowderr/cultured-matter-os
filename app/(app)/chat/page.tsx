import { FullChat } from "@/components/layout/full-chat";
import { agentWriteActionNames } from "@/lib/agent-actions";
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
// and Schedules, and the model picker is off. Web search is on: it runs through Firecrawl,
// which needs no sandbox or browser.
//
// Exactly one screen, so the page never scrolls: the height leaves out the header (with
// the notch inset above it), the home-bar inset the layout pads below the page (so the
// composer sits above the home indicator in the installed app), and the inset sidebar
// variant's margin (--inset-gap, set by the layout).
export default function ChatPage() {
  return (
    <div className="-m-(--content-padding) h-[calc(100svh-var(--header-height)-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--inset-gap,0px))]">
      <FullChat
        writeActions={agentWriteActionNames()}
        className="h-full"
        workbenchTabs={["memory", "schedules"]}
        suggestions={CHAT_SUGGESTIONS}
        greeting={{ title: "What can I help with?", description: "Ask about your grants, Radar, people or tasks." }}
        models={false}
      />
    </div>
  );
}

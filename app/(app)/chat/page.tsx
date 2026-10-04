import { generateMeta } from "@/lib/utils";
import { ChatScreen } from "./chat-screen";

export async function generateMetadata() {
  return generateMeta({
    title: "Chat",
    description: "Ask about Radar, grants, people and tasks. Changes wait for your approval."
  });
}

export default function Page() {
  return <ChatScreen />;
}

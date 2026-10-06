"use client";

import type { ComponentProps } from "react";

import { ChatSwitcher } from "@/components/chat/chat-switcher";
import { useRefreshAfterWrites } from "@/hooks/use-refresh-after-writes";

// /chat's full chat (the kit's ChatSwitcher), refreshing the app's data after the
// assistant's approved writes, as the docked panel does.
export function FullChat({
  writeActions,
  ...props
}: ComponentProps<typeof ChatSwitcher> & { writeActions: readonly string[] }) {
  const onToolEnd = useRefreshAfterWrites(writeActions);
  return <ChatSwitcher {...props} onToolEnd={onToolEnd} />;
}

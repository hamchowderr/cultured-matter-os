"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { createWriteRefresher, type ToolEnd } from "@/lib/refresh-after-writes";

/**
 * A tool-end handler for the chat (`onToolEnd`): after the assistant's approved write
 * actions, refresh the page once so it shows what changed. Stable for the component's
 * life, so it doesn't re-render the chat.
 */
export function useRefreshAfterWrites(writeActions: readonly string[]): (tool: ToolEnd) => void {
  // The app router's instance is stable, so this is built once per set of actions.
  const router = useRouter();
  const key = writeActions.join("|");
  const refresher = React.useMemo(
    () => createWriteRefresher(key.split("|").filter(Boolean), () => router.refresh()),
    [key, router]
  );
  React.useEffect(() => () => refresher.cancel(), [refresher]);
  return refresher.onToolEnd;
}

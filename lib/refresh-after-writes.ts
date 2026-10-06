// When the assistant's tool call changes app data (an approved write action), the page
// beside the chat still shows the old data. This refreshes it once: a run that writes
// several things in a row (results arriving together) gets one refresh, after they settle.

export type ToolEnd = { toolName: string; isError: boolean };

/**
 * Returns a tool-end handler that calls `refresh` once, `delay` ms after the last
 * successful call to one of `writeActions`. Reads, failed calls and the assistant's own
 * tools (memory, tasks) change nothing on the page, so they are ignored. `cancel` drops
 * a pending refresh (on unmount).
 */
export function createWriteRefresher(
  writeActions: Iterable<string>,
  refresh: () => void,
  delay = 400
) {
  const names = new Set(writeActions);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    onToolEnd(tool: ToolEnd) {
      if (tool.isError || !names.has(tool.toolName)) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, delay);
    },
    cancel() {
      clearTimeout(timer);
    }
  };
}

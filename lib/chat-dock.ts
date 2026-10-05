// The docked assistant's remembered state (components/layout/chat-dock.tsx). The layout
// reads these cookies on the server so the dock loads the way it was left, with no flash.

export const CHAT_DOCK_OPEN_COOKIE = "chat_dock_open";
export const CHAT_DOCK_WIDTH_COOKIE = "chat_dock_width";

export const CHAT_DOCK_MIN = 320;
export const CHAT_DOCK_MAX = 640;
export const CHAT_DOCK_DEFAULT = 400;

export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return CHAT_DOCK_DEFAULT;
  return Math.round(Math.min(CHAT_DOCK_MAX, Math.max(CHAT_DOCK_MIN, width)));
}

// Open unless she closed it ("false"); the first visit has no cookie, so it starts open.
export function parseDockOpen(value: string | undefined): boolean {
  return value !== "false";
}

export function parseDockWidth(value: string | undefined): number {
  return value === undefined ? CHAT_DOCK_DEFAULT : clampDockWidth(Number(value));
}

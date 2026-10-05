// The docked assistant's remembered state (components/layout/chat-dock.tsx). The layout
// reads these cookies on the server so the dock loads the way it was left, with no flash.

export const CHAT_DOCK_OPEN_COOKIE = "chat_dock_open";
export const CHAT_DOCK_WIDTH_COOKIE = "chat_dock_width";

export const CHAT_DOCK_MIN = 320;
export const CHAT_DOCK_MAX = 640;
export const CHAT_DOCK_DEFAULT = 400;

// What the page keeps beside the dock: the expanded left sidebar plus 35rem. The same
// numbers drive the CSS cap (DOCK_WIDTH_CSS) and the JS one (dockCap), so the column, the
// cookie and the resize handle's aria-valuenow always agree.
const SIDEBAR_PX = 256;
const PAGE_MIN_PX = 560;

/** The widest the dock can be in a window this wide. */
export function dockCap(viewportWidth: number): number {
  return Math.max(CHAT_DOCK_MIN, Math.min(CHAT_DOCK_MAX, viewportWidth - SIDEBAR_PX - PAGE_MIN_PX));
}

/** The dock's width in CSS: the remembered width (or a live drag), under the same cap. */
export function dockWidthCss(width: number): string {
  return `max(${CHAT_DOCK_MIN}px, min(var(--chat-dock-width, ${width}px), ${CHAT_DOCK_MAX}px, calc(100vw - ${SIDEBAR_PX + PAGE_MIN_PX}px)))`;
}

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

"use client";

import { useEffect, useRef } from "react";

// Guards a screen with unsaved edits (the mind-map editor) against leaving it.
// - Closing or reloading the tab: the browser's own "Leave site?" prompt (beforeunload).
// - In-app links: Next's <Link> doesn't fire beforeunload on client navigation. Its onNavigate
//   prop is the supported hook: guardLink(href) cancels the navigation and hands the href to the
//   screen, which asks and then navigates itself. The sidebar, header and the screen's own links
//   use it. Browser back/forward is not covered.

type Guard = { onBlocked: (href: string) => void };
let active: Guard | null = null;

/** Whether a screen with unsaved edits is open. */
export function hasUnsavedChanges() {
  return active !== null;
}

/**
 * For a Link's onNavigate: when a screen has unsaved edits, cancel and let it ask first.
 * Pass the same href the Link goes to.
 */
export function guardLink(href: string) {
  return (e: { preventDefault: () => void }) => {
    if (!active) return;
    e.preventDefault();
    active.onBlocked(href);
  };
}

/** For router.push callers (the search palette): true when navigation may go ahead now. */
export function mayNavigate(href: string) {
  if (!active) return true;
  active.onBlocked(href);
  return false;
}

/**
 * Registers the screen while `dirty`. onBlocked receives the href an in-app link tried to open;
 * the screen asks, then navigates (after clearing its edits) if she agrees.
 */
export function useUnsavedChangesGuard(dirty: boolean, onBlocked: (href: string) => void) {
  const handler = useRef(onBlocked);
  useEffect(() => {
    handler.current = onBlocked;
  });
  useEffect(() => {
    if (!dirty) return;
    const guard: Guard = { onBlocked: (href) => handler.current(href) };
    active = guard;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      if (active === guard) active = null;
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);
}

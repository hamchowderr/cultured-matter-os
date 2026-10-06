"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

// From 1024px the page scrolls inside its own element under the header (app/(app)/layout),
// not the window. Next scrolls a new page to the top for us, but the browser only restores
// the window's scroll position on back and forward, and Next has nothing for a nested
// scroller. This keeps each history entry's position while you are on it and puts it back
// when you return to that entry with back or forward. Any other navigation is left to Next
// (the top of the new page). Below 1024px the window scrolls and the browser restores it.
//
// History entries come from the Navigation API (each entry has a stable key, and the
// current entry changes before the new page renders). Where a browser lacks it, nothing is
// restored and Next's behaviour stands.

type NavEntry = { key: string };
type Navigation = EventTarget & { currentEntry: NavEntry | null };
type EntryChange = Event & { navigationType?: string | null };

const positions = new Map<string, number>();

export function PageScrollRestoration({ selector }: { selector: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // A back or forward waiting to be put back: the position to scroll to.
  const pending = React.useRef<number | null>(null);

  React.useEffect(() => {
    const navigation = (window as unknown as { navigation?: Navigation }).navigation;
    const el = document.querySelector<HTMLElement>(selector);
    if (!navigation || !el) return;
    // While a back/forward waits to be put back, the outgoing page's content changing
    // must not overwrite any saved position.
    const save = () => {
      const key = navigation.currentEntry?.key;
      if (key && pending.current === null) positions.set(key, el.scrollTop);
    };
    const onEntryChange = (e: Event) => {
      if ((e as EntryChange).navigationType !== "traverse") return;
      const key = navigation.currentEntry?.key;
      pending.current = (key && positions.get(key)) || 0;
    };
    el.addEventListener("scroll", save, { passive: true });
    navigation.addEventListener("currententrychange", onEntryChange);
    return () => {
      el.removeEventListener("scroll", save);
      navigation.removeEventListener("currententrychange", onEntryChange);
    };
  }, [selector]);

  // Once the page it went back (or forward) to has rendered, put the position back. Its
  // content may still be arriving, so keep trying for a moment until it is tall enough.
  React.useEffect(() => {
    const target = pending.current;
    const el = document.querySelector<HTMLElement>(selector);
    if (target === null || !el) return;
    let frame = 0;
    let tries = 0;
    const restore = () => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) > 1 && tries++ < 60) {
        frame = requestAnimationFrame(restore);
      } else {
        pending.current = null;
      }
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [selector, pathname, search]);

  return null;
}

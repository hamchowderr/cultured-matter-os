"use client";

// Paging and filtering that change only the list. Navigation keeps the scroll position and runs
// in a transition, so the current rows stay on screen (dimmed) until the next ones arrive. When
// they do, the list's top is scrolled into view, but only if it is above the viewport.

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useTransition,
  type ComponentProps,
  type ReactNode
} from "react";

import { cn } from "@/lib/utils";

type Navigate = (href: string, options?: { replace?: boolean }) => void;
type Value = { pending: boolean; navigate: Navigate };

const ListTransitionContext = createContext<Value | null>(null);

export function ListTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate: Navigate = (href, options) =>
    startTransition(() =>
      options?.replace
        ? router.replace(href, { scroll: false })
        : router.push(href, { scroll: false })
    );
  return (
    <ListTransitionContext.Provider value={{ pending, navigate }}>
      {children}
    </ListTransitionContext.Provider>
  );
}

/** The shared navigation, or a local one when no ListTransition is above. */
export function useListNavigation(): Value {
  const shared = useContext(ListTransitionContext);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (shared) return shared;
  return {
    pending,
    navigate: (href, options) =>
      startTransition(() =>
        options?.replace
          ? router.replace(href, { scroll: false })
          : router.push(href, { scroll: false })
      )
  };
}

/** Brings an element's top into view when it sits above the viewport. */
export function revealTop(el: HTMLElement | null) {
  // After the new rows are in, so nothing else moves the page in the same tick. Smooth only
  // where it can run (a hidden tab never animates) and the visitor has not asked for less motion.
  setTimeout(() => {
    if (!el || el.getBoundingClientRect().top >= 0) return;
    const calm = document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  });
}

/** The part of the page that changes: dimmed while loading, revealed when loaded. */
export function ListRegion({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useListNavigation();
  const ref = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) revealTop(ref.current);
    wasPending.current = pending;
  }, [pending]);

  return (
    <div
      ref={ref}
      aria-busy={pending}
      className={cn("scroll-mt-20 transition-opacity", pending && "opacity-60", className)}
    >
      {children}
    </div>
  );
}

/** A link that navigates through the list transition instead of a full page change. */
export function ListLink({
  href,
  replace,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { href: string; replace?: boolean }) {
  const { navigate } = useListNavigation();
  return (
    <Link
      href={href}
      scroll={false}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href, { replace });
      }}
      {...props}
    />
  );
}

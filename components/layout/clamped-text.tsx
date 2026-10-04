"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Two lines on a phone with a "more" link when the text runs longer; in full on wider screens. */
export function ClampedText({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      <p ref={ref} className={cn(!open && "max-md:line-clamp-2")}>
        {children}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-foreground font-medium underline-offset-4 hover:underline md:hidden"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

import Link from "next/link";

import { cn } from "@/lib/utils";

// The two halves of the Archive: the activity timeline and the imported Apple Notes. Links that
// look like the tabs component's list (components/ui/tabs.tsx), since each half is its own page.
const TABS = [
  { value: "activity", label: "Activity", href: "/archive" },
  { value: "notes", label: "Notes", href: "/archive/notes" }
] as const;

export function ArchiveTabs({ current }: { current: (typeof TABS)[number]["value"] }) {
  return (
    <nav
      aria-label="Archive sections"
      className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center rounded-lg p-[3px]"
      data-tour-step-id="archive-tabs"
    >
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          aria-current={t.value === current ? "page" : undefined}
          className={cn(
            "inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors",
            t.value === current
              ? "bg-background text-foreground dark:bg-input/30 shadow-sm"
              : "hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

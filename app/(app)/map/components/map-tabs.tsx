import Link from "next/link";

import { cn } from "@/lib/utils";

// The two kinds of map: the live business map and the maps she saves. Links styled like the
// tabs list (components/ui/tabs.tsx), as in the Archive, since each is its own page.
const TABS = [
  { value: "business", label: "Business map", href: "/map" },
  { value: "saved", label: "Saved maps", href: "/map/saved" }
] as const;

export function MapTabs({ current }: { current: (typeof TABS)[number]["value"] }) {
  return (
    <nav
      aria-label="Map sections"
      className="bg-muted text-muted-foreground touch:h-[50px] inline-flex h-9 w-fit items-center rounded-lg p-[3px]"
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

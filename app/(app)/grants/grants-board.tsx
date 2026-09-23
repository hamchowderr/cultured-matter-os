"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { setGrantStatus } from "@/actions/server";
import type { Grant } from "@/actions/schemas";
import { GrantCard } from "@/components/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status = NonNullable<Grant["status"]>;

const COLUMNS: { key: Status | "new"; label: string; hint: string }[] = [
  { key: "new", label: "Found", hint: "Not on the board yet" },
  { key: "watching", label: "Watching", hint: "Worth keeping an eye on" },
  { key: "applying", label: "Applying", hint: "Working on an application" },
  { key: "submitted", label: "Submitted", hint: "Waiting to hear back" },
  { key: "passed", label: "Passed", hint: "Not pursuing" }
];

export function GrantsBoard({
  grants,
  filters
}: {
  grants: Grant[];
  filters: { query?: string; closingSoon: boolean; includeNonprofit: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query ?? "");
  // Moves show instantly; the server copy catches up on refresh.
  const [moved, setMoved] = useState<Record<string, Status>>({});

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function move(grant: Grant, status: Status) {
    setMoved((m) => ({ ...m, [grant.id]: status }));
    const result = await setGrantStatus({ grantId: grant.id, status });
    if (!result.ok) {
      setMoved(({ [grant.id]: _, ...rest }) => rest);
      toast.error(result.error.message);
      return;
    }
    toast.success(`Moved to ${COLUMNS.find((c) => c.key === status)!.label}`);
    startTransition(() => router.refresh());
  }

  const withMoves = grants.map((g) => (moved[g.id] ? { ...g, status: moved[g.id] } : g));
  const columns = COLUMNS.map((col) => ({
    ...col,
    // Already sorted by the server: soonest deadline first, rolling last.
    items: withMoves.filter((g) => (g.status ?? "new") === col.key)
  }));

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, agency or description"
            className="h-8 pl-9"
            aria-label="Search grants"
          />
        </div>
        <Button
          size="sm"
          variant={filters.closingSoon ? "default" : "outline"}
          onClick={() => update({ soon: filters.closingSoon ? undefined : "1" })}
        >
          Closing within 30 days
        </Button>
        <Button
          size="sm"
          variant={filters.includeNonprofit ? "default" : "outline"}
          onClick={() => update({ all: filters.includeNonprofit ? undefined : "1" })}
        >
          Include nonprofit-only
        </Button>
        <span className="text-muted-foreground ml-auto text-sm">
          {grants.length} {grants.length === 1 ? "grant" : "grants"}
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3">
          {columns.map((col) => (
            <section key={col.key} className="bg-muted/50 flex flex-col gap-2 rounded-lg p-2">
              <header className="flex items-baseline justify-between px-1 pt-1">
                <h2 className="text-sm font-medium">{col.label}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {col.items.length}
                </span>
              </header>
              <p className="text-muted-foreground px-1 text-xs">{col.hint}</p>
              <div className="flex max-h-[calc(100vh-18rem)] flex-col gap-2 overflow-y-auto">
                {col.items.map((g) => (
                  <GrantCard
                    key={g.id}
                    grant={g}
                    onStatusChange={(s) => move(g, s)}
                    className="p-3"
                  />
                ))}
                {col.items.length === 0 && (
                  <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
                    Nothing here
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Placeholders the segment loading.tsx files show while a page's data loads. Built from the kit's
// Skeleton and Card so they match the pages' spacing; the screen reader hears one status line.

function Status() {
  return (
    <span role="status" className="sr-only">
      Loading…
    </span>
  );
}

function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-row flex-wrap items-end justify-between gap-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-[70vw]" />
      </div>
      {action && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </CardContent>
    </Card>
  );
}

// Today: heading, a row of stat cards, then a grid of cards.
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <Status />
      <HeaderSkeleton action />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </div>
  );
}

// Inbox, Projects, People, Radar, Grants, Archive: heading, a filter row, then a list.
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <Status />
      <HeaderSkeleton action />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Settings: heading, then stacked cards.
export function SettingsSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <Status />
      <HeaderSkeleton />
      <CardSkeleton lines={2} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={2} />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <span role="status" className="sr-only">
        Loading…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-80 max-w-[80vw]" />
      </div>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-[calc(100dvh-var(--header-height)-12rem)] min-h-[420px] w-full rounded-xl" />
    </div>
  );
}

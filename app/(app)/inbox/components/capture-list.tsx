import { formatDistanceToNow } from "date-fns";
import { ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { type Capture, KIND_LABEL, useInboxStore } from "../use-inbox";

export function CaptureList({ items, empty }: { items: Capture[]; empty: string }) {
  const { selectedId, setSelectedId } = useInboxStore();

  if (items.length === 0) {
    return <p className="text-muted-foreground p-8 text-center text-sm">{empty}</p>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "hover:bg-accent/70 flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all",
              selectedId === item.id && "bg-accent/70"
            )}
            onClick={() => setSelectedId(item.id)}
          >
            <div className="flex w-full items-center gap-2">
              {item.imagePath && (
                <ImageIcon className="text-muted-foreground size-3.5 shrink-0" aria-label="Photo" />
              )}
              <div
                className={cn(
                  "ml-auto text-xs",
                  selectedId === item.id ? "text-foreground" : "text-muted-foreground"
                )}
                suppressHydrationWarning
              >
                {formatDistanceToNow(new Date(item.filedAt ?? item.createdAt), { addSuffix: true })}
              </div>
            </div>
            <div className="line-clamp-2 w-full text-sm">
              {item.body.substring(0, 300) || (item.imagePath ? "Photo" : "")}
            </div>
            {item.kind ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{KIND_LABEL[item.kind]}</Badge>
                {item.tier && <Badge variant="outline">Tier {item.tier}</Badge>}
                {item.projectName && <Badge variant="outline">{item.projectName}</Badge>}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

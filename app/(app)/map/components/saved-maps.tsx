"use client";

import { NetworkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createMindMap, deleteMindMap } from "@/actions/server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { MAX_TITLE } from "@/lib/mind-map";
import { cn } from "@/lib/utils";
import { TextDialog } from "./text-dialog";

type Summary = {
  id: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: Date;
};

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SavedMaps({ maps }: { maps: Summary[] }) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [creating, startCreating] = useTransition();
  const [deleting, setDeleting] = useState<Summary | null>(null);
  const [pending, startTransition] = useTransition();

  const create = (title: string) =>
    startCreating(async () => {
      const result = await createMindMap({ title });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setNaming(false);
      router.push(`/map/saved/${result.data.id}`);
    });

  const remove = (map: Summary) =>
    startTransition(async () => {
      const result = await deleteMindMap({ mindMapId: map.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Deleted ${map.title}`);
    });

  return (
    <div className={cn("space-y-4", pending && "opacity-80")}>
      {maps.length > 0 && (
        <Button onClick={() => setNaming(true)}>
          <PlusIcon />
          New map
        </Button>
      )}
      {maps.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NetworkIcon />
            </EmptyMedia>
            <EmptyTitle>No saved maps yet</EmptyTitle>
            <EmptyDescription>
              Start one for a brainstorm, a project plan or a sponsor map. You can link its nodes to
              your projects, people and grants.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setNaming(true)}>
              <PlusIcon />
              New map
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {maps.map((m) => (
            <li key={m.id}>
              <Card className="hover:border-foreground/20 relative gap-2 py-4 transition-colors">
                <CardHeader className="px-4">
                  <CardTitle className="min-w-0 truncate text-base">
                    <Link
                      href={`/map/saved/${m.id}`}
                      className="after:absolute after:inset-0 after:content-['']"
                    >
                      {m.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {plural(m.nodeCount, "node")} · {plural(m.edgeCount, "link")} · changed{" "}
                    {when.format(m.updatedAt)}
                  </CardDescription>
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative z-10 size-8"
                      aria-label={`Delete ${m.title}`}
                      onClick={() => setDeleting(m)}
                    >
                      <Trash2Icon />
                    </Button>
                  </CardAction>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <TextDialog
        open={naming}
        title="New map"
        description="What is this map about? You can rename it later."
        label="Title"
        initial=""
        max={MAX_TITLE}
        submitLabel="Create map"
        pending={creating}
        onCancel={() => setNaming(false)}
        onSubmit={create}
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The map goes for good. The records it links to stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && remove(deleting)}>
              Delete map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

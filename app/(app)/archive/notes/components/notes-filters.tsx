"use client";

// The top of the note list: search, the folder picker and "New note". The same on every screen
// size, so folders are always in one place.

import { PlusIcon, SearchIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { createNote } from "@/actions/server";
import { useListNavigation } from "@/components/layout/list-transition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const ALL = "all";
const NONE = "none";
const folderValue = (f: string) => `f:${f}`;

export function NotesFilters({
  query: initialQuery,
  folder,
  noFolder,
  folders,
  all
}: {
  query?: string;
  folder?: string;
  noFolder: boolean;
  folders: { folder: string | null; count: number }[];
  all: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { navigate } = useListNavigation();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [creating, startCreating] = useTransition();

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const s = next.toString();
    navigate(s ? `${pathname}?${s}` : pathname, { replace: true });
  }

  useEffect(() => setQuery(initialQuery ?? ""), [initialQuery]);

  // Search as she types, after a short pause.
  useEffect(() => {
    if (query === (initialQuery ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  function newNote() {
    startCreating(async () => {
      const result = await createNote({ folder: folder ?? null });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      // Clear the search so the new note shows in the list.
      const next = new URLSearchParams(params.toString());
      next.delete("q");
      next.delete("page");
      next.set("note", result.data.id);
      setQuery("");
      navigate(`${pathname}?${next.toString()}`);
    });
  }

  const current = noFolder ? NONE : folder ? folderValue(folder) : ALL;

  return (
    <div className="space-y-2 border-b p-3">
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          className="ps-9"
          aria-label="Search notes"
        />
      </div>
      <div className="flex gap-2">
        <Select
          value={current}
          onValueChange={(v) =>
            update({
              folder: v.startsWith("f:") ? v.slice(2) : undefined,
              nofolder: v === NONE ? "1" : undefined
            })
          }
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label="Folder">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All notes ({all.toLocaleString()})</SelectItem>
            {folders.map((f) =>
              f.folder == null ? (
                <SelectItem key={NONE} value={NONE}>
                  No folder ({f.count.toLocaleString()})
                </SelectItem>
              ) : (
                <SelectItem key={f.folder} value={folderValue(f.folder)}>
                  {f.folder} ({f.count.toLocaleString()})
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <Button onClick={newNote} disabled={creating}>
          <PlusIcon />
          New note
        </Button>
      </div>
    </div>
  );
}

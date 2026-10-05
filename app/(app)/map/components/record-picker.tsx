"use client";

import { useEffect, useState } from "react";

import { findLinkableRecords } from "@/actions/server";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { RECORD_LABELS, RECORD_TYPES, type RecordType } from "@/lib/mind-map";
import { RECORD_ICONS } from "./map-nodes";

// A record a saved-map node can link to.
export type PickableRecord = { type: RecordType; id: string; title: string; href: string | null };

const GROUP: Record<RecordType, string> = {
  project: "Projects",
  task: "Tasks",
  contact: "People",
  company: "Radar companies",
  grant: "Grants",
  idea: "Ideas"
};

// Before she types: what's on the business map. As she types: every record of each kind whose
// name matches, searched on the server (findLinkableRecords).
export function RecordPicker({
  open,
  records,
  onOpenChange,
  onPick
}: {
  open: boolean;
  records: PickableRecord[];
  onOpenChange: (open: boolean) => void;
  onPick: (record: PickableRecord) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; records: PickableRecord[] } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await findLinkableRecords({ query: q });
      if (!stale) setFound({ query: q, records: result.ok ? result.data : [] });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q]);

  const searching = !!q && found?.query !== q;
  const shown = q ? (found?.query === q ? found.records : []) : records;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery("");
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Link a record</DialogTitle>
          <DialogDescription>
            Find a project, task, person, Radar company, grant or idea to link this node to.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search projects, tasks, people…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[50dvh]">
            <CommandEmpty>{searching ? "Searching…" : "Nothing matches."}</CommandEmpty>
            {RECORD_TYPES.map((type) => {
              const list = shown.filter((r) => r.type === type);
              if (!list.length) return null;
              const Icon = RECORD_ICONS[type];
              return (
                <CommandGroup key={type} heading={GROUP[type]}>
                  {list.map((r) => (
                    <CommandItem
                      key={`${r.type}:${r.id}`}
                      value={`${r.type}:${r.id}`}
                      keywords={[r.title, RECORD_LABELS[type]]}
                      onSelect={() => {
                        setQuery("");
                        onPick(r);
                      }}
                      className="touch:min-h-11"
                    >
                      <Icon />
                      <span className="truncate">{r.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

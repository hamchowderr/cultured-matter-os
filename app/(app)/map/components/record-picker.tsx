"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { RECORD_LABELS, RECORD_TYPES, type RecordType } from "@/lib/mind-map";
import { RECORD_ICONS } from "./map-nodes";

// A record a saved-map node can link to: everything on the live business map.
export type PickableRecord = { type: RecordType; id: string; title: string; href: string | null };

const GROUP: Record<RecordType, string> = {
  project: "Projects",
  task: "Tasks",
  contact: "People",
  company: "Radar companies",
  grant: "Grants",
  idea: "Ideas"
};

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
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Link a record"
      description="Find a project, task, person, Radar company, grant or idea to link this node to."
    >
      <CommandInput placeholder="Search projects, tasks, people…" />
      <CommandList className="max-h-[50dvh]">
        <CommandEmpty>Nothing on the business map matches.</CommandEmpty>
        {RECORD_TYPES.map((type) => {
          const list = records.filter((r) => r.type === type);
          if (!list.length) return null;
          const Icon = RECORD_ICONS[type];
          return (
            <CommandGroup key={type} heading={GROUP[type]}>
              {list.map((r) => (
                <CommandItem
                  key={`${r.type}:${r.id}`}
                  value={`${r.title} ${RECORD_LABELS[type]} ${r.id}`}
                  onSelect={() => onPick(r)}
                >
                  <Icon />
                  <span className="truncate">{r.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { setWorkScope } from "@/actions/server";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SCOPE_LABELS, WORK_SCOPES, type WorkScope } from "@/lib/personal";
import { cn } from "@/lib/utils";

// Business / Personal / All, on Today and Projects. Her choice is saved to her settings, so both
// screens (and every device) open on it next time. The kit's segmented ToggleGroup (outline, no
// gaps), as in the theme customizer.
export function ScopeSwitch({
  scope,
  tourId,
  onChanged,
  className
}: {
  scope: WorkScope;
  // A navigation to make once the choice is saved. Without it, the save refreshes the page.
  onChanged?: () => void;
  // The guided-tour step that points at this switch (lib/tours.ts).
  tourId?: string;
  className?: string;
}) {
  const [value, setValue] = useState(scope);
  const [pending, startTransition] = useTransition();
  // The server's answer wins once the page refreshes.
  useEffect(() => setValue(scope), [scope]);

  function change(next: string) {
    // Radix sends "" when the active item is pressed again; keep the current choice.
    if (!next || next === value) return;
    const previous = value;
    setValue(next as WorkScope);
    startTransition(async () => {
      // A caller that navigates afterwards renders the page itself; skip the action's refresh.
      const result = await setWorkScope({ scope: next as WorkScope, refresh: !onChanged });
      if (!result.ok) {
        setValue(previous);
        toast.error(result.error.message);
        return;
      }
      if (result.data.added.length) {
        toast.success("Added personal projects to get you started", {
          description: `${result.data.added.join(", ")}. Delete any you don't need.`
        });
      }
      onChanged?.();
    });
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      onValueChange={change}
      aria-label="Show business, personal or all tasks"
      data-tour-step-id={tourId}
      className={cn(pending && "opacity-70", className)}
    >
      {WORK_SCOPES.map((s) => (
        <ToggleGroupItem key={s} value={s} className="px-3">
          {SCOPE_LABELS[s]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

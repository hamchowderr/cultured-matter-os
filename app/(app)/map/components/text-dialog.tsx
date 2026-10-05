"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One text field in a dialog: naming a map, renaming a map or a node. Works the same with a
// mouse, a keyboard and a phone keyboard (Enter saves).
export function TextDialog({
  open,
  title,
  description,
  label,
  initial,
  max,
  submitLabel = "Save",
  pending,
  onCancel,
  onSubmit
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  initial: string;
  max: number;
  submitLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so each opening starts from the current text. */}
        {open && (
          <TextForm
            key={initial}
            title={title}
            description={description}
            label={label}
            initial={initial}
            max={max}
            submitLabel={submitLabel}
            pending={pending}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TextForm({
  title,
  description,
  label,
  initial,
  max,
  submitLabel,
  pending,
  onCancel,
  onSubmit
}: {
  title: string;
  description?: string;
  label: string;
  initial: string;
  max: number;
  submitLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? undefined : "sr-only"}>
          {description ?? `${label}, up to ${max} characters.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="map-text">{label}</Label>
        <Input
          id="map-text"
          value={value}
          maxLength={max}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createProject } from "@/actions/server";
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

export function NewProjectDialog({
  open,
  onOpenChange,
  businesses,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businesses: string[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState(businesses[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !business) setBusiness(businesses[0]);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const result = await createProject({
      name: name.trim(),
      business: business?.trim() || undefined
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    setName("");
    toast.success(`Created ${result.data.name}`);
    onCreated(result.data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Projects sit under a business. Type a new business name to add one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-business">Business</Label>
            <Input
              id="project-business"
              list="businesses"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
            />
            <datalist id="businesses">
              {businesses.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

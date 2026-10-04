"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createProject } from "@/actions/server";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectDrawer({
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

  // Each time it opens, start on the first choice (Personal when the switch is on Personal).
  useEffect(() => {
    if (open) setBusiness(businesses[0]);
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
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>New project</DrawerTitle>
          <DrawerDescription>
            Projects sit under a business, or under Personal for life admin. Type a new business
            name to add one.
          </DrawerDescription>
        </DrawerHeader>
        <form onSubmit={submit} className="space-y-6 overflow-y-auto p-4 pt-0">
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
            <Label htmlFor="project-business">Business or Personal</Label>
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
          <Button className="w-full" type="submit" disabled={saving || !name.trim()}>
            Create project
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

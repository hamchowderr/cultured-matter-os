"use client";

// Adapted from the kit's project-management/components/add-reminder-dialog.tsx: a task with a
// title, an optional due date, a priority and a project. Category is gone (tasks have none).

import * as React from "react";
import { toast } from "sonner";

import { createTask } from "@/actions/server";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { priorities, type TaskPriority } from "@/lib/task-priority";
import { fromDateInput, type ProjectSummary } from "../types";

export function AddTaskDrawer({
  open,
  onOpenChange,
  projects,
  defaultProjectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectSummary[];
  defaultProjectId: string | null;
}) {
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("medium");
  const [projectId, setProjectId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setProjectId(defaultProjectId ?? projects[0]?.id ?? "");
  }, [open, defaultProjectId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setSaving(true);
    const result = await createTask({
      title: title.trim(),
      projectId,
      priority,
      dueDate: fromDateInput(due) ?? undefined
    });
    setSaving(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(`Added "${result.data.title}"`);
    setTitle("");
    setDue("");
    setPriority("medium");
    onOpenChange(false);
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Add a task</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={handleAdd} className="space-y-6 overflow-y-auto p-4 pt-0">
          <div className="grid space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="new-task-title">Task</Label>
              <Input
                id="new-task-title"
                autoFocus
                placeholder="What needs doing?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-task-due">Due date</Label>
              <Input
                id="new-task-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-task-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger id="new-task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <p.icon className="text-muted-foreground size-4" />
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-task-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="new-task-project" className="w-full">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.business} / {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.length === 0 && (
                <p className="text-muted-foreground text-sm">Create a project first.</p>
              )}
            </div>
          </div>
          <Button className="w-full" type="submit" disabled={saving || !title.trim() || !projectId}>
            Add task
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import * as React from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

import { type Capture, type Project, useInboxStore } from "../use-inbox";
import { CaptureBody, CaptureHeader } from "./capture-display";

// The kit's mobile mail view: picking an item from the list opens it in a bottom drawer.
export function CaptureDisplayMobile({
  capture,
  projects,
  onFiled
}: {
  capture: Capture | null;
  projects: Project[];
  onFiled: (id: string) => void;
}) {
  const { selectedId, setSelectedId } = useInboxStore();
  const open = !!selectedId && !!capture;

  return (
    <Drawer open={open} onOpenChange={(next) => !next && setSelectedId(null)}>
      <DrawerContent className="h-[85vh]">
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>Inbox item</DialogTitle>
          </DialogHeader>
        </VisuallyHidden>
        {capture && (
          <div className="flex min-h-0 flex-1 flex-col">
            <CaptureHeader capture={capture} />
            <CaptureBody capture={capture} projects={projects} onFiled={onFiled} />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

"use client";

// The folder list in a sheet below the xl breakpoint, like the kit notes app's NoteMobileSidebar
// (apps/notes/components/note-sidebar.tsx). It closes once a folder has been picked.

import { FolderIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function FolderSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const params = useSearchParams().toString();
  useEffect(() => setOpen(false), [params]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 xl:hidden" aria-label="Folders">
          <FolderIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-0 overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>Folders</SheetTitle>
        </SheetHeader>
        <div className="pt-10">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

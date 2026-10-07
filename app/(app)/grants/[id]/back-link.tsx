"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { guardLink } from "@/lib/unsaved-changes";

// The grant page's "Grants" link, guarded like the sidebar's: with unsaved answers on the page,
// the application editor asks before leaving (lib/unsaved-changes.ts).
export function BackToGrants() {
  return (
    <Button variant="ghost" className="-ml-2 h-11 md:h-9" asChild>
      <Link href="/grants" onNavigate={guardLink("/grants")}>
        <ArrowLeftIcon />
        Grants
      </Link>
    </Button>
  );
}

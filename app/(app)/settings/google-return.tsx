"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

// Back from Google after Sync Google on this page: say how it went, then tidy the URL.
export function GoogleReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const outcome = params.get("google");
    if (!outcome) return;
    if (outcome === "connected") toast.success("Google is connected.");
    else toast.error("Google wasn't connected. Please try again.");
    router.replace(pathname, { scroll: false });
  }, [params]);

  return null;
}

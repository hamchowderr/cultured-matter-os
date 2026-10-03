"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

// Back from Microsoft after Connect Outlook on this page: say how it went, then tidy the URL.
export function OutlookReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const outcome = params.get("outlook");
    if (!outcome) return;
    if (outcome === "connected") toast.success("Outlook is connected.");
    else toast.error("Outlook wasn't connected. Please try again.");
    router.replace(pathname, { scroll: false });
  }, [params]);

  return null;
}

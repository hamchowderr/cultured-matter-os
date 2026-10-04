"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { STATUS_BAR_COLORS } from "@/lib/themes";

// Registers the service worker and keeps the browser/status-bar colour on the app's own theme.
// The root layout's viewport export sets theme-color per system colour scheme; when the owner
// picks light or dark in the app instead, this rewrites those tags to the chosen theme.
export function PwaSetup() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Production only: a worker in `next dev` would serve stale hot-reload assets.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.error("Service worker registration failed", error));
  }, []);

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    const color = STATUS_BAR_COLORS[resolvedTheme];
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((tag) => tag.setAttribute("content", color));
  }, [resolvedTheme]);

  return null;
}

"use client";

import { useEffect } from "react";

import "./globals.css";

import { Button } from "@/components/ui/button";

// Last resort when the root layout itself fails. It replaces the whole document, so it brings its
// own <html>, <body> and styles. The app's theme provider is gone too, so it reads her saved
// light/dark choice (next-themes keeps it under "theme"); light, the app's default, otherwise.
export default function GlobalError({
  error,
  retry
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => console.error(error), [error]);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    const dark =
      saved === "dark" ||
      (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return (
    <html lang="en">
      <body className="bg-background text-foreground font-sans antialiased">
        <title>Something went wrong · Cultured Matter</title>
        <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Cultured Matter didn&apos;t load
          </h1>
          <p className="text-muted-foreground text-sm">
            Something went wrong on our side. Your saved work is safe. Try again in a moment.
          </p>
          <Button onClick={() => retry()}>Try again</Button>
          {error.digest && (
            <p className="text-muted-foreground text-xs">Error code: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}

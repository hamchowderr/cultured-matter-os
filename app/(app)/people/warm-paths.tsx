"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { contactWarmPaths } from "@/actions/server";
import { Spinner } from "@/components/ui/spinner";

type ContactPath = Extract<
  Awaited<ReturnType<typeof contactWarmPaths>>,
  { ok: true }
>["data"]["paths"][number];

// Why this person can introduce you, in plain words.
function pathReason(p: ContactPath): string {
  const brandOf = p.via === "brand" ? `, a brand paired with ${p.companyName}` : "";
  if (p.reason === "works_at") return `Works at ${p.target}${brandOf}`;
  return p.via === "brand" ? `You linked them to ${p.target}${brandOf}` : "You linked them by hand";
}

// The Radar companies and target brands a contact can introduce you to. Each opens on Radar.
export function ContactWarmPaths({ contactId }: { contactId: string }) {
  const [paths, setPaths] = useState<ContactPath[] | null>(null);

  useEffect(() => {
    let live = true;
    setPaths(null);
    contactWarmPaths({ contactId }).then((result) => {
      if (!live) return;
      if (result.ok) setPaths(result.data.paths);
      else {
        setPaths([]);
        toast.error(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, [contactId]);

  if (paths === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (paths.length === 0) {
    return (
      <p className="text-muted-foreground py-2 text-sm">
        No Radar companies yet. They show up here when this person works at one, or at a brand
        paired with one.
      </p>
    );
  }
  return (
    <ul className="divide-y text-sm">
      {paths.map((p) => (
        <li key={`${p.companyId}:${p.via}:${p.target}:${p.reason}:${p.linkId ?? ""}`}>
          <Link
            href={`/radar?company=${encodeURIComponent(p.companyId)}`}
            className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.target}</span>
              <span className="text-muted-foreground block">{pathReason(p)}</span>
              {p.note && <span className="text-muted-foreground block italic">“{p.note}”</span>}
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="sr-only">Open on Radar</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

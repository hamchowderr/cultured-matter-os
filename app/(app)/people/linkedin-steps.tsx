import { ExternalLinkIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const SETTINGS_URL = "https://www.linkedin.com/psettings/data-privacy/";

// How Simone gets her Connections.csv; only she can export it from her own account.
export function LinkedInSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("list-decimal space-y-2 pl-5 text-left text-sm", className)}>
      <li>
        Open{" "}
        <a
          href={SETTINGS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-foreground inline-flex items-center gap-1 font-medium underline underline-offset-4"
        >
          LinkedIn data privacy settings
          <ExternalLinkIcon className="size-3.5" />
        </a>
        .
      </li>
      <li>
        Click <strong>Get a copy of your data</strong>.
      </li>
      <li>
        Choose <strong>Connections</strong> only, then click <strong>Request archive</strong>.
      </li>
      <li>LinkedIn emails you a download link. It can take up to 48 hours.</li>
      <li>
        Download the file, open the zip, and upload <strong>Connections.csv</strong> here.
      </li>
    </ol>
  );
}

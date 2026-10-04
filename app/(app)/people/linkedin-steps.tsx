import { ExternalLinkIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const SETTINGS_URL = "https://www.linkedin.com/psettings/data-privacy/";

// How Simone gets her Connections.csv; only she can export it from her own account.
export function LinkedInSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("list-decimal space-y-2 pl-5 text-left text-sm", className)}>
      <li>
        Use a computer. The LinkedIn app on a phone can&apos;t do this. Open{" "}
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
        Choose <strong>Download larger data archive, including connections…</strong> (the first
        option), then click <strong>Request archive</strong>.
      </li>
      <li>LinkedIn emails you when the file is ready. This can take up to a day.</li>
      <li>
        Download the file from the link in that email and unzip it. Upload the{" "}
        <strong>Connections.csv</strong> file from inside it here.
      </li>
    </ol>
  );
}

"use client";

import { MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { GRAPH_SCOPES } from "@/lib/graph-scopes";

// Asks Microsoft for the Outlook permissions on the account she already signed in with.
export async function connectOutlook() {
  const back = window.location.pathname;
  const { error } = await authClient.linkSocial({
    provider: "microsoft",
    scopes: [...GRAPH_SCOPES],
    callbackURL: `${back}?outlook=connected`,
    errorCallbackURL: `${back}?outlook=failed`
  });
  // On success the browser is already on its way to Microsoft.
  if (error) toast.error("Couldn't reach Microsoft. Please try again.");
}

export function ConnectOutlookButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size={size}
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await connectOutlook();
        setPending(false);
      }}
    >
      {pending ? <Spinner /> : <MailIcon />}
      Connect Outlook
    </Button>
  );
}

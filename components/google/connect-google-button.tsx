"use client";

import { MailIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { GOOGLE_SCOPES } from "@/lib/google-scopes";

// Asks Google for the Gmail and Contacts permissions on the account she already signed in with.
export async function connectGoogle() {
  const back = window.location.pathname;
  const { error } = await authClient.linkSocial({
    provider: "google",
    scopes: [...GOOGLE_SCOPES],
    callbackURL: `${back}?google=connected`,
    errorCallbackURL: `${back}?google=failed`
  });
  // On success the browser is already on its way to Google.
  if (error) toast.error("Couldn't reach Google. Please try again.");
}

export function ConnectGoogleButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size={size}
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await connectGoogle();
        setPending(false);
      }}
    >
      {pending ? <Spinner /> : <MailIcon />}
      Sync Google
    </Button>
  );
}

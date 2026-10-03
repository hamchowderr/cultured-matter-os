"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="size-4">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function MicrosoftSignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: "/today",
      errorCallbackURL: "/sign-in"
    });
    // On success the browser is already on its way to Microsoft.
    if (error) {
      setPending(false);
      toast.error("Couldn't reach Microsoft. Please try again.");
    }
  }

  return (
    <Button size="lg" variant="outline" className="w-full" onClick={signIn} disabled={pending}>
      {pending ? <Spinner /> : <MicrosoftLogo />}
      Sign in with Microsoft
    </Button>
  );
}

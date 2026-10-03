import { CircleAlertIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ACCOUNT_NOT_ALLOWED } from "@/lib/allowed-emails";
import { getSession } from "@/lib/session";
import { generateMeta } from "@/lib/utils";
import { GoogleSignInButton } from "./google-button";

export async function generateMetadata() {
  return generateMeta({
    title: "Sign in",
    description: "Sign in to Cultured Matter with your Google account."
  });
}

type SearchParams = Promise<{ error?: string }>;

function errorMessage(code: string) {
  if (code === ACCOUNT_NOT_ALLOWED) {
    return {
      title: "This account isn't allowed",
      body: "Cultured Matter only opens for its owner's Google account. Try again and pick that account."
    };
  }
  return {
    title: "Sign-in didn't finish",
    body: "Google didn't complete the sign-in. Please try again."
  };
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  if (await getSession()) redirect("/today");

  const { error } = await searchParams;
  const problem = error ? errorMessage(error) : null;

  return (
    <main className="bg-background flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="bg-foreground text-background flex size-11 items-center justify-center rounded-lg text-sm font-semibold">
            CM
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Cultured Matter</h1>
            <p className="text-muted-foreground text-sm">Sign in to pick up where you left off.</p>
          </div>
        </div>

        {problem && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>{problem.body}</AlertDescription>
          </Alert>
        )}

        <GoogleSignInButton />
      </div>
    </main>
  );
}

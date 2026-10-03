"use client";

import { ArrowRightLeftIcon, CheckIcon, MailIcon } from "lucide-react";
import { useState } from "react";

import { connectOutlook } from "@/components/outlook/connect-outlook-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

const ALLOWS = [
  "Read your Outlook contacts, to add them to People",
  "See who you emailed and when, with a link to each email",
  "Save follow-up emails you approve in your Drafts, for you to send"
];

// Explains what connecting Outlook allows before Microsoft asks her to agree
// (from the UI kit's dashboard-modal24).
export function ConnectOutlookDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MailIcon />
          Connect Outlook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <div className="flex items-center justify-center gap-4 pt-2">
          <span className="bg-foreground text-background flex size-8 items-center justify-center rounded-lg text-xs font-semibold">
            CM
          </span>
          <ArrowRightLeftIcon className="text-muted-foreground size-4" />
          <span className="flex size-8 items-center justify-center rounded-lg border">
            <MailIcon className="text-muted-foreground size-4" />
          </span>
        </div>

        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-lg">Connect Outlook</DialogTitle>
          <DialogDescription className="max-w-sm">
            Microsoft will ask you to agree. You use the same account you sign in with.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">This lets Cultured Matter</p>
          <ul className="flex flex-col gap-3">
            {ALLOWS.map((line) => (
              <li key={line} className="flex items-center gap-3 text-sm">
                <span className="bg-primary/10 flex size-6 shrink-0 items-center justify-center rounded-full">
                  <CheckIcon className="text-primary size-3.5" />
                </span>
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground text-sm">
          Nothing is sent from your account without you. Your emails are never changed or deleted.
        </p>

        <DialogFooter className="pt-2 sm:justify-between">
          <Button variant="outline" className="grow" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button
            className="grow"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await connectOutlook();
              setPending(false);
            }}
          >
            {pending && <Spinner />}
            Continue to Microsoft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

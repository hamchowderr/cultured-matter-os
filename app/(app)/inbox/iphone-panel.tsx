"use client";

import { ChevronDownIcon, SmartphoneIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const CAPTURE_URL = "https://cultured-matter-os.vercel.app/api/capture";

// How to install the iPhone Shortcuts from the shared iCloud links. Building and sharing them is
// in docs/iphone-shortcut.md. The capture key itself is never shown here.
export function IphonePanel() {
  return (
    <Collapsible className="bg-card rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-left">
        <SmartphoneIcon className="text-muted-foreground size-5 shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-medium">Capture from your iPhone</span>
          <span className="text-muted-foreground block text-xs">
            Send a thought, a voice note or a photo straight to this Inbox.
          </span>
        </span>
        <ChevronDownIcon className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t p-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">What you were sent</p>
          <p className="text-muted-foreground">
            Two links, one for <em>Capture</em> (words, spoken or typed) and one for{" "}
            <em>Capture Photo</em>, plus a capture key sent separately. Treat the key like a
            password: anyone with it can add to your Inbox.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Add each Shortcut</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>On your iPhone, tap the first link. It opens in the Shortcuts app.</li>
            <li>
              Tap <strong className="text-foreground">Add Shortcut</strong>.
            </li>
            <li>
              When it asks for your key, paste the key exactly as it was sent to you (it starts with{" "}
              <code className="bg-muted rounded px-1">Bearer</code>), then tap{" "}
              <strong className="text-foreground">Add</strong>.
            </li>
            <li>Do the same with the second link.</li>
          </ol>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Try it</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>
              In the Shortcuts app, tap <strong className="text-foreground">Capture</strong>, say
              something, and wait for “Saved to your Inbox.”
            </li>
            <li>
              Tap <strong className="text-foreground">Capture Photo</strong> and pick a photo.
            </li>
            <li>
              Both show up here under <strong className="text-foreground">To sort</strong>.
            </li>
          </ol>
          <p className="text-muted-foreground">
            If it says “Unauthorized”, the key is wrong: open the Shortcut, tap the{" "}
            <code className="bg-muted rounded px-1">Authorization</code> value and paste the key
            again, starting with <code className="bg-muted rounded px-1">Bearer</code>. Both
            Shortcuts send to <code className="bg-muted rounded px-1 break-all">{CAPTURE_URL}</code>
            .
          </p>
        </div>

        <p className="text-muted-foreground">
          Tip: add the shortcuts to your Home Screen, or say “Hey Siri, Capture”. Everything you
          send lands under <strong className="text-foreground">To sort</strong> here.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

"use client";

import { ChevronDownIcon, SmartphoneIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const CAPTURE_URL = "https://cultured-matter-os.vercel.app/api/capture";

// How to build the iPhone Shortcut. The same steps live in docs/iphone-shortcut.md.
// The capture key itself is never shown here.
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
          <p className="font-medium">Before you start</p>
          <p className="text-muted-foreground">
            You need your capture key. It comes from whoever set up this app for you, sent
            privately. Treat it like a password: anyone with it can add to your Inbox. If it ever
            leaks, they can change it and you paste the new one into the Shortcut.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Build the Shortcut</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>
              Open the <strong className="text-foreground">Shortcuts</strong> app, tap{" "}
              <strong className="text-foreground">+</strong>, and name the shortcut <em>Capture</em>
              .
            </li>
            <li>
              Tap <strong className="text-foreground">Add Action</strong> and add{" "}
              <strong className="text-foreground">Dictate Text</strong> (to speak) or{" "}
              <strong className="text-foreground">Ask for Input</strong> (to type).
            </li>
            <li>
              Add <strong className="text-foreground">Get Contents of URL</strong>. Tap the URL and
              enter <code className="bg-muted rounded px-1 break-all">{CAPTURE_URL}</code>
            </li>
            <li>
              Tap the arrow next to it to show more. Set{" "}
              <strong className="text-foreground">Method</strong> to{" "}
              <strong className="text-foreground">POST</strong>.
            </li>
            <li>
              Under <strong className="text-foreground">Headers</strong>, tap{" "}
              <em>Add new header</em>. Key:{" "}
              <code className="bg-muted rounded px-1">Authorization</code>. Value:{" "}
              <code className="bg-muted rounded px-1">Bearer</code>, a space, then your capture key.
            </li>
            <li>
              Set <strong className="text-foreground">Request Body</strong> to{" "}
              <strong className="text-foreground">Form</strong>. Tap <em>Add new field</em>, choose{" "}
              <strong className="text-foreground">Text</strong>, name it{" "}
              <code className="bg-muted rounded px-1">text</code>, and for its value pick the{" "}
              <em>Dictated Text</em> (or <em>Provided Input</em>) variable.
            </li>
            <li>
              Add <strong className="text-foreground">Show Result</strong> at the end so you see
              “Saved to your Inbox.” Tap <strong className="text-foreground">Done</strong>.
            </li>
          </ol>
        </div>

        <div className="space-y-1">
          <p className="font-medium">For photos, make a second Shortcut</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5">
            <li>
              Start with <strong className="text-foreground">Select Photos</strong> (or{" "}
              <strong className="text-foreground">Take Photo</strong>).
            </li>
            <li>
              Add <strong className="text-foreground">Convert Image</strong> to JPEG, then{" "}
              <strong className="text-foreground">Resize Image</strong> to a width of 2000. This
              keeps the photo small enough to send and viewable on any computer.
            </li>
            <li>
              Add <strong className="text-foreground">Get Contents of URL</strong> set up exactly as
              above, but in the Form add a <strong className="text-foreground">File</strong> field
              named <code className="bg-muted rounded px-1">photo</code> with the{" "}
              <em>Resized Image</em> variable. You can add a{" "}
              <code className="bg-muted rounded px-1">text</code> field too, for a caption.
            </li>
            <li>
              End with <strong className="text-foreground">Show Result</strong>.
            </li>
          </ol>
        </div>

        <p className="text-muted-foreground">
          Tip: add the shortcuts to your Home Screen, or say “Hey Siri, Capture”. Everything you
          send lands under <strong className="text-foreground">To sort</strong> here.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

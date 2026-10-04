"use client";

// Adapted from the shadcn UI kit block tables15: label/value rows with copy buttons.

import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  HandshakeIcon,
  LinkedinIcon,
  MailIcon,
  PencilIcon
} from "lucide-react";
import * as React from "react";

import type { Contact } from "@/actions/schemas";
import { FollowUpDialog } from "@/components/outlook/follow-up-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORIES } from "@/lib/categories";
import { formatDate, initials } from "@/lib/format";
import { sourceLabel } from "./contacts-table";
import { ContactEmails } from "./outlook";
import { ContactWarmPaths } from "./warm-paths";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the value is still on screen to select by hand.
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7 shrink-0"
            onClick={copy}
          >
            {copied ? (
              <CheckIcon className="text-primary size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            <span className="sr-only">Copy {label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : `Copy ${label}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead
        scope="row"
        className="text-muted-foreground h-auto w-32 ps-0 pe-3 py-2.5 align-top font-normal"
      >
        {label}
      </TableHead>
      <TableCell className="ps-3 pe-0 py-2.5 whitespace-normal">{children}</TableCell>
    </TableRow>
  );
}

const Blank = () => <span className="text-muted-foreground">—</span>;

export function ContactSheet({
  contact,
  open,
  onOpenChange,
  onToggleSector,
  onToggleNewsletter
}: {
  // The contact with any unsaved tag or newsletter change already applied.
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSector: (contact: Contact, sector: string, on: boolean) => void;
  onToggleNewsletter: (contact: Contact, on: boolean) => void;
}) {
  const [drafting, setDrafting] = React.useState(false);

  if (!contact) return null;
  const role = [contact.position, contact.company].filter(Boolean).join(" at ");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center gap-3 pr-8">
              <Avatar className="size-11">
                <AvatarFallback>{initials(contact.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <SheetTitle className="truncate text-lg">{contact.fullName}</SheetTitle>
                <SheetDescription className="truncate">{role || "No role yet"}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-4">
            <div className="overflow-hidden">
              <Table>
                <TableBody>
                  <DetailRow label="Email">
                    {contact.email ? (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <a
                          href={`mailto:${contact.email}`}
                          className="min-w-0 truncate hover:underline"
                        >
                          {contact.email}
                        </a>
                        <CopyButton value={contact.email} label="email" />
                      </div>
                    ) : (
                      <Blank />
                    )}
                  </DetailRow>
                  <DetailRow label="LinkedIn">
                    {contact.profileUrl ? (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <a
                          href={contact.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 hover:underline"
                        >
                          <LinkedinIcon className="text-muted-foreground size-3.5 shrink-0" />
                          <span className="truncate">Open profile</span>
                          <ExternalLinkIcon className="text-muted-foreground size-3 shrink-0" />
                        </a>
                        <CopyButton value={contact.profileUrl} label="LinkedIn link" />
                      </div>
                    ) : (
                      <Blank />
                    )}
                  </DetailRow>
                  <DetailRow label="Company">{contact.company || <Blank />}</DetailRow>
                  <DetailRow label="Role">{contact.position || <Blank />}</DetailRow>
                  {contact.companyDomain && (
                    <DetailRow label="Website">
                      <a
                        href={`https://${contact.companyDomain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {contact.companyDomain}
                      </a>
                    </DetailRow>
                  )}
                  <DetailRow label="Sectors">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {contact.sectors.map((s) => (
                        <Badge key={s} variant="secondary" className="font-normal">
                          {s}
                        </Badge>
                      ))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground h-6 px-2"
                          >
                            <PencilIcon className="size-3" />
                            {contact.sectors.length ? "Edit" : "Add sectors"}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="max-h-80 w-60 overflow-y-auto"
                        >
                          <DropdownMenuLabel>Sectors</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {CATEGORIES.map((cat) => (
                            <DropdownMenuCheckboxItem
                              key={cat}
                              checked={contact.sectors.includes(cat)}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={(on) => onToggleSector(contact, cat, !!on)}
                            >
                              {cat}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DetailRow>
                  <DetailRow label="Newsletter">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={contact.newsletter}
                        disabled={!contact.email && !contact.newsletter}
                        onCheckedChange={(on) => onToggleNewsletter(contact, on)}
                      />
                      <span className={contact.email ? undefined : "text-muted-foreground"}>
                        {!contact.email && !contact.newsletter
                          ? "Needs an email address"
                          : contact.newsletter
                            ? "On the newsletter"
                            : "Not on the newsletter"}
                      </span>
                    </label>
                  </DetailRow>
                  <DetailRow label="Source">{sourceLabel(contact.source)}</DetailRow>
                  {contact.connectedOn && (
                    <DetailRow label="Connected">{contact.connectedOn}</DetailRow>
                  )}
                  <DetailRow label="Added">
                    <span className="text-muted-foreground">{formatDate(contact.createdAt)}</span>
                  </DetailRow>
                </TableBody>
              </Table>
            </div>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <HandshakeIcon className="text-muted-foreground size-4" />
                Can introduce you to
              </h3>
              <ContactWarmPaths contactId={contact.id} />
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <MailIcon className="text-muted-foreground size-4" />
                Recent emails
              </h3>
              {contact.email ? (
                <ContactEmails contactId={contact.id} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No email address, so no Gmail emails.
                </p>
              )}
            </section>
          </div>

          <SheetFooter className="mt-auto border-t">
            <Button
              onClick={() => setDrafting(true)}
              disabled={!contact.email}
              title={contact.email ? undefined : "Needs an email address"}
            >
              Draft follow-up
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <FollowUpDialog open={drafting} onOpenChange={setDrafting} contact={contact} />
    </>
  );
}

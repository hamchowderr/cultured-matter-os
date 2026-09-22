"use client";

import { LinkedinIcon, MailIcon } from "lucide-react";

import type { Contact } from "@/actions/schemas";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ContactCardProps = {
  contact: Contact;
  // Why this contact is shown, e.g. "Works at Glossier, paired with Soliome".
  reason?: string;
  className?: string;
};

export function ContactCard({ contact, reason, className }: ContactCardProps) {
  const role = [contact.position, contact.company].filter(Boolean).join(" at ");

  return (
    <article className={cn("bg-card flex gap-3 rounded-lg border p-4", className)}>
      <Avatar className="size-10">
        <AvatarFallback>{initials(contact.fullName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="truncate font-semibold">{contact.fullName}</h3>
          {role && <p className="text-muted-foreground truncate text-sm">{role}</p>}
        </div>
        {reason && <p className="text-sm">{reason}</p>}
        {contact.sectors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contact.sectors.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        )}
        <div className="text-muted-foreground flex gap-3 text-xs">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <MailIcon className="size-3" />
              {contact.email}
            </a>
          )}
          {contact.profileUrl && (
            <a
              href={contact.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <LinkedinIcon className="size-3" />
              LinkedIn
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

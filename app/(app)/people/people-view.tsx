"use client";

import { CircleHelpIcon, SearchIcon, TagIcon, UploadIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { importContacts, setContactSectors } from "@/actions/server";
import type { Contact } from "@/actions/schemas";
import { ContactCard } from "@/components/cards";
import { ComingSoon } from "@/components/layout/page-shell";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { LinkedInSteps } from "./linkedin-steps";
import { ContactOutlookButton, OutlookSync } from "./outlook";

export function PeopleView({
  contacts,
  total,
  page,
  pageSize,
  filters,
  outlookConnected
}: {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  filters: { query?: string; sector?: string };
  outlookConnected: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query ?? "");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Tag edits show instantly; the server copy catches up on refresh.
  const [tags, setTags] = useState<Record<string, string[]>>({});

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    const result = await importContacts({ csv: await file.text() });
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const { created, updated, skipped } = result.data;
    toast.success(
      `Imported ${created} new and updated ${updated} contacts${skipped ? ` (${skipped} rows had no profile link or email)` : ""}`
    );
    startTransition(() => router.refresh());
  }

  async function toggleSector(contact: Contact, sector: string, on: boolean) {
    const current = tags[contact.id] ?? contact.sectors;
    const next = on ? [...current, sector] : current.filter((s) => s !== sector);
    setTags((t) => ({ ...t, [contact.id]: next }));
    const result = await setContactSectors({ contactId: contact.id, sectors: next });
    if (!result.ok) {
      setTags(({ [contact.id]: _, ...rest }) => rest);
      toast.error(result.error.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  const pageHref = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${pathname}?${next.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!(filters.query || filters.sector);

  const importButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
        <UploadIcon />
        {importing ? "Importing…" : "Import LinkedIn connections"}
      </Button>
    </>
  );

  const outlookButton = (
    <OutlookSync
      connected={outlookConnected}
      onSynced={() => startTransition(() => router.refresh())}
    />
  );

  if (total === 0 && !filtered) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No contacts yet</EmptyTitle>
          <EmptyDescription>
            Bring in your LinkedIn connections in five steps, or your Outlook contacts in one.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-md">
          <LinkedInSteps />
          <div className="flex flex-wrap justify-center gap-2">
            {importButton}
            {outlookButton}
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company or role"
            className="h-8 pl-9"
            aria-label="Search contacts"
          />
        </div>
        <NativeSelect
          size="sm"
          className="w-auto"
          value={filters.sector ?? ""}
          onChange={(e) => update({ sector: e.target.value || undefined })}
          aria-label="Sector"
        >
          <NativeSelectOption value="">All sectors</NativeSelectOption>
          {CATEGORIES.map((c) => (
            <NativeSelectOption key={c} value={c}>
              {c}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span className="text-muted-foreground text-sm">
          {total.toLocaleString()} {total === 1 ? "contact" : "contacts"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost">
                <CircleHelpIcon />
                How to get this file
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <LinkedInSteps />
            </PopoverContent>
          </Popover>
          {outlookButton}
          {importButton}
        </div>
      </div>

      {contacts.length === 0 ? (
        <ComingSoon
          icon={UsersIcon}
          title="No one matches"
          description="Try another search or sector."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {contacts.map((c) => {
            const sectors = tags[c.id] ?? c.sectors;
            return (
              <ContactCard
                key={c.id}
                contact={{ ...c, sectors }}
                actions={
                  <div className="flex shrink-0 items-center">
                    <ContactOutlookButton contact={c} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Tag ${c.fullName}`}
                        >
                          <TagIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
                        <DropdownMenuLabel>Sectors</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {CATEGORIES.map((cat) => (
                          <DropdownMenuCheckboxItem
                            key={cat}
                            checked={sectors.includes(cat)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={(on) => toggleSector(c, cat, !!on)}
                          >
                            {cat}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pages">
          <Button size="sm" variant="outline" disabled={page <= 1} asChild={page > 1}>
            {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {page} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
            {page < pages ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </nav>
      )}
    </div>
  );
}

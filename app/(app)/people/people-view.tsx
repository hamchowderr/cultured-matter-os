"use client";

import { CircleHelpIcon, SearchIcon, UploadIcon, UsersIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { importContacts, setContactSectors, setNewsletter } from "@/actions/server";
import type { Contact } from "@/actions/schemas";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { ContactSheet } from "./contact-sheet";
import { ContactsTable, type SortDir, type SortKey } from "./contacts-table";
import { LinkedInSteps } from "./linkedin-steps";
import { NewsletterBar, type NewsletterStatus } from "./newsletter-bar";
import { OutlookSync } from "./outlook";

const NEWSLETTER_CHIPS = [
  { value: undefined, label: "Everyone" },
  { value: "1", label: "On the newsletter" },
  { value: "0", label: "Not on it" }
] as const;

export function PeopleView({
  contacts,
  total,
  page,
  pageSize,
  filters,
  sort,
  dir,
  newsletter,
  outlookConnected
}: {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  filters: { query?: string; sector?: string; newsletter?: boolean };
  sort: SortKey;
  dir: SortDir;
  newsletter: NewsletterStatus | null;
  outlookConnected: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query ?? "");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Tag and newsletter edits show instantly; the server copy catches up on refresh.
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [onList, setOnList] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const withEdits = (c: Contact): Contact => ({
    ...c,
    sectors: tags[c.id] ?? c.sectors,
    newsletter: onList[c.id] ?? c.newsletter
  });
  const rows = contacts.map(withEdits);
  // Keep the open contact fresh after a refresh, even if it left the current page.
  const open = selected ? withEdits(contacts.find((c) => c.id === selected.id) ?? selected) : null;

  const href = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Any change other than paging starts again from page 1.
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname]
  );

  function update(patch: Record<string, string | undefined>) {
    startTransition(() => router.replace(href(patch), { scroll: false }));
  }

  useEffect(() => {
    if (query === (filters.query ?? "")) return;
    const t = setTimeout(() => update({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [query]);

  const pageHref = useCallback(
    (p: number) => href({ page: p > 1 ? String(p) : undefined }),
    [href]
  );
  const sortHref = useCallback(
    (s: SortKey, d: SortDir) =>
      href({ sort: s === "name" ? undefined : s, dir: d === "asc" ? undefined : d }),
    [href]
  );

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

  async function toggleNewsletter(contact: Contact, on: boolean) {
    setOnList((m) => ({ ...m, [contact.id]: on }));
    const result = await setNewsletter({ contactId: contact.id, on });
    if (!result.ok) {
      setOnList(({ [contact.id]: _, ...rest }) => rest);
      toast.error(result.error.message);
      return;
    }
    toast.success(
      on ? `${contact.fullName} is on the newsletter` : `${contact.fullName} is off the newsletter`
    );
    startTransition(() => router.refresh());
  }

  const filtered = !!(filters.query || filters.sector || filters.newsletter !== undefined);
  const newsletterParam =
    filters.newsletter === undefined ? undefined : filters.newsletter ? "1" : "0";

  const importButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        data-tour-step-id="people-import"
      >
        <UploadIcon />
        {importing ? "Importing…" : "Import LinkedIn connections"}
      </Button>
    </>
  );

  const outlookButton = (
    <span className="inline-flex" data-tour-step-id="people-google">
      <OutlookSync
        connected={outlookConnected}
        onSynced={() => startTransition(() => router.refresh())}
      />
    </span>
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
            Bring in your LinkedIn connections in five steps, or your Google contacts in one.
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
        <InputGroup className="h-8 w-full sm:w-64" data-tour-step-id="people-search">
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company or role"
            aria-label="Search contacts"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <span className="text-muted-foreground text-sm">
          {total.toLocaleString()} {total === 1 ? "contact" : "contacts"}
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
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

      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2"
        data-tour-step-id="people-filters"
      >
        <div className="max-w-full overflow-x-auto">
          <ButtonGroup aria-label="Newsletter">
            {NEWSLETTER_CHIPS.map((chip) => (
              <Button
                key={chip.label}
                size="sm"
                variant="outline"
                aria-pressed={newsletterParam === chip.value}
                onClick={() => update({ newsletter: chip.value })}
                className={cn(
                  newsletterParam === chip.value &&
                    "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
              >
                {chip.label}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sector</span>
          <Select
            value={filters.sector ?? "all"}
            onValueChange={(v) => update({ sector: v === "all" ? undefined : v })}
          >
            <SelectTrigger size="sm" className="w-fit gap-1" aria-label="Sector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sectors</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {newsletter && (
        <NewsletterBar
          status={newsletter}
          showingOnly={filters.newsletter === true}
          onToggleOnly={() => update({ newsletter: filters.newsletter === true ? undefined : "1" })}
        />
      )}

      <ContactsTable
        contacts={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        sortHref={sortHref}
        pageHref={pageHref}
        onOpen={(c) => {
          setSelected(c);
          setSheetOpen(true);
        }}
        empty={
          <div className="space-y-3">
            <p className="font-medium">No one matches</p>
            <p className="text-muted-foreground text-sm">Try another search or sector.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQuery("");
                update({ q: undefined, sector: undefined, newsletter: undefined });
              }}
            >
              Clear filters
            </Button>
          </div>
        }
      />

      <ContactSheet
        contact={open}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onToggleSector={toggleSector}
        onToggleNewsletter={toggleNewsletter}
      />
    </div>
  );
}

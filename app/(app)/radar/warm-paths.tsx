"use client";

import { PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  addPairing,
  findWarmPath,
  linkContact,
  listPairings,
  removePairing,
  searchContacts,
  unlinkContact
} from "@/actions/server";
import type { Contact, Pairing } from "@/actions/schemas";
import { ContactCard } from "@/components/cards";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Path = Extract<
  Awaited<ReturnType<typeof findWarmPath>>,
  { ok: true }
>["data"]["paths"][number];
type Result = { ok: true } | { ok: false; error: { message: string } };

function reasonFor(p: Path) {
  const brand = p.via === "brand" ? " (paired brand)" : "";
  if (p.reason === "works_at") return `Works at ${p.target}${brand}`;
  const to = p.via === "brand" ? ` to ${p.target}${brand}` : "";
  return `Linked by hand${to}${p.note ? `: ${p.note}` : ""}`;
}

// One card per person, with every way they connect to this company.
function groupByContact(paths: Path[]) {
  const groups = new Map<string, { contact: Contact; paths: Path[] }>();
  for (const p of paths) {
    const g = groups.get(p.contact.id) ?? { contact: p.contact, paths: [] };
    g.paths.push(p);
    groups.set(p.contact.id, g);
  }
  return [...groups.values()].sort((a, b) => a.contact.fullName.localeCompare(b.contact.fullName));
}

// Each change refreshes the page from the server action, so the list's counts follow.
export function WarmPaths({ company }: { company: { id: string; name: string } }) {
  const [paths, setPaths] = useState<Path[] | null>(null);
  const [brands, setBrands] = useState<Pairing[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([
      findWarmPath({ companyId: company.id }),
      listPairings({ companyId: company.id })
    ]);
    if (p.ok) setPaths(p.data.paths);
    else toast.error(p.error.message);
    if (b.ok) setBrands(b.data.pairings);
  }, [company.id]);

  useEffect(() => {
    setPaths(null);
    setBrands([]);
    load();
  }, [load]);

  async function save(call: () => Promise<Result>, done: string) {
    setBusy(true);
    const result = await call();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(done);
    await load();
    return true;
  }

  const groups = paths ? groupByContact(paths) : [];

  return (
    <>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Warm paths</h3>
        {paths === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="bg-muted/40 text-muted-foreground flex gap-3 rounded-lg p-4 text-sm">
            <UsersIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              None of your contacts connect to {company.name} yet. Add a target brand below, or link
              someone you know by hand.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(({ contact, paths: ps }) => {
              const linkIds = ps.map((p) => p.linkId).filter((x): x is string => !!x);
              return (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  reason={ps.map(reasonFor).join(" · ")}
                  actions={
                    linkIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          save(async () => {
                            for (const linkId of linkIds) {
                              const r = await unlinkContact({ linkId });
                              if (!r.ok) return r;
                            }
                            return { ok: true };
                          }, `Unlinked ${contact.fullName}`)
                        }
                      >
                        <XIcon />
                        Unlink
                      </Button>
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <TargetBrands company={company} brands={brands} busy={busy} save={save} />
      <LinkContact company={company} brands={brands} busy={busy} save={save} />
    </>
  );
}

type SaveFn = (call: () => Promise<Result>, done: string) => Promise<boolean>;

function TargetBrands({
  company,
  brands,
  busy,
  save
}: {
  company: { id: string; name: string };
  brands: Pairing[];
  busy: boolean;
  save: SaveFn;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const brandName = name.trim();
    if (!brandName) return;
    const ok = await save(
      () =>
        addPairing({
          companyId: company.id,
          brandName,
          brandDomain: website.trim() || undefined
        }),
      `Paired ${brandName} with ${company.name}`
    );
    if (ok) {
      setName("");
      setWebsite("");
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Target brands</h3>
      <p className="text-muted-foreground text-xs">
        Brands {company.name} could work with. Anyone you know at these brands shows up above.
      </p>
      {brands.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {brands.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {b.brandName}
                {b.brandDomain && (
                  <span className="text-muted-foreground ml-2 text-xs">{b.brandDomain}</span>
                )}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${b.brandName}`}
                  >
                    <XIcon />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {b.brandName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Anyone you linked to {b.brandName} by hand for {company.name} will be unlinked
                      too.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        save(
                          () => removePairing({ pairingId: b.id }),
                          `Removed ${b.brandName} from ${company.name}`
                        )
                      }
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Brand name"
          aria-label="Brand name"
          maxLength={200}
        />
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Website (optional)"
          aria-label="Brand website"
          maxLength={500}
        />
        <Button type="submit" variant="outline" disabled={busy || !name.trim()}>
          <PlusIcon />
          Add
        </Button>
      </form>
    </section>
  );
}

function LinkContact({
  company,
  brands,
  busy,
  save
}: {
  company: { id: string; name: string };
  brands: Pairing[];
  busy: boolean;
  save: SaveFn;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[] | null>(null);
  const [picked, setPicked] = useState<Contact | null>(null);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await searchContacts({ query: q, limit: 6 });
      if (!cancelled) setResults(r.ok ? r.data.contacts : []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function reset() {
    setPicked(null);
    setQuery("");
    setResults(null);
    setTarget("");
    setNote("");
  }

  async function link(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    const brand = brands.find((b) => b.id === target);
    const ok = await save(
      () =>
        linkContact({
          contactId: picked.id,
          ...(brand ? { pairingId: brand.id } : { companyId: company.id }),
          note: note.trim() || undefined
        }),
      `Linked ${picked.fullName} to ${brand ? brand.brandName : company.name}`
    );
    if (ok) reset();
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Link a contact by hand</h3>
      {picked ? (
        <form onSubmit={link} className="bg-muted/40 space-y-2 rounded-lg p-3">
          <p className="text-sm">
            <span className="font-medium">{picked.fullName}</span>
            {picked.company && <span className="text-muted-foreground"> · {picked.company}</span>}
          </p>
          {brands.length > 0 && (
            <NativeSelect
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Connects to"
            >
              <NativeSelectOption value="">Connects to {company.name}</NativeSelectOption>
              {brands.map((b) => (
                <NativeSelectOption key={b.id} value={b.id}>
                  Connects to {b.brandName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How do they connect? (optional)"
            aria-label="Note"
            maxLength={2000}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              Link
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your contacts by name or company"
              aria-label="Search contacts"
              className="pl-8"
            />
          </div>
          {results !== null &&
            (results.length === 0 ? (
              <p className="text-muted-foreground text-sm">No contacts match.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(c)}
                      className="hover:bg-muted w-full px-3 py-2 text-left"
                    >
                      <span className="font-medium">{c.fullName}</span>
                      {(c.position || c.company) && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {[c.position, c.company].filter(Boolean).join(" at ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </section>
  );
}

"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  getCompany,
  passCompany,
  resetCompany,
  shortlistCompany,
  starCompany
} from "@/actions/server";
import type { Company } from "@/actions/schemas";
import { CompanyCard } from "@/components/cards";
import { ComingSoon } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { RadarIcon } from "lucide-react";
import { WarmPaths } from "./warm-paths";

type RadarCompany = Company & { sources: string[] };
type Detail = Extract<Awaited<ReturnType<typeof getCompany>>, { ok: true }>["data"];
type NoteAction = { kind: "shortlist" | "pass"; company: RadarCompany };

export function RadarList({
  companies,
  total,
  page,
  pageSize,
  newSince,
  warmPathCounts = {}
}: {
  companies: RadarCompany[];
  total: number;
  page: number;
  pageSize: number;
  newSince: Date | null;
  warmPathCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [noteFor, setNoteFor] = useState<NoteAction | null>(null);
  // Kept separate so the dialog title does not change while it animates closed.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState<{ company: RadarCompany; data: Detail | null } | null>(null);

  async function run(
    company: RadarCompany,
    call: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>,
    done: string
  ) {
    setBusyId(company.id);
    const result = await call();
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(done);
    setDetail(null);
    startTransition(() => router.refresh());
  }

  async function openDetail(company: RadarCompany) {
    setDetail({ company, data: null });
    const result = await getCompany({ companyId: company.id });
    if (result.ok) setDetail({ company, data: result.data });
    else toast.error(result.error.message);
  }

  // ?company=<id> (e.g. from the Archive) opens that company's detail panel on arrival.
  const linkedId = params.get("company");
  useEffect(() => {
    if (!linkedId) return;
    getCompany({ companyId: linkedId }).then((result) => {
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const sources = [...new Set(result.data.sightings.map((s) => s.source))];
      setDetail({ company: { ...result.data.company, sources }, data: result.data });
    });
  }, [linkedId]);

  function confirmNote() {
    if (!noteFor) return;
    const { kind, company } = noteFor;
    const input = { companyId: company.id, note: note.trim() || undefined };
    setNoteOpen(false);
    setNote("");
    if (kind === "shortlist") {
      run(company, () => shortlistCompany(input), `Shortlisted ${company.name}`);
    } else {
      run(company, () => passCompany(input), `Passed on ${company.name}`);
    }
  }

  const pageHref = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${pathname}?${next.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (companies.length === 0) {
    return (
      <ComingSoon
        icon={RadarIcon}
        title="No companies match"
        description="Try another tab or clear the filters."
      />
    );
  }

  return (
    <>
      <p className="text-muted-foreground text-sm">
        {total.toLocaleString()} {total === 1 ? "company" : "companies"}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {companies.map((c) => (
          <div key={c.id} className="relative">
            {newSince && c.firstSeenAt > newSince && (
              <Badge variant="info" className="absolute -top-2 right-3 z-10">
                New
              </Badge>
            )}
            <CompanyCard
              company={c}
              sources={c.sources}
              warmPathCount={warmPathCounts[c.id]}
              busy={busyId === c.id}
              onOpen={() => openDetail(c)}
              onStar={() => run(c, () => starCompany({ companyId: c.id }), `Starred ${c.name}`)}
              onShortlist={() => {
                setNoteFor({ kind: "shortlist", company: c });
                setNoteOpen(true);
              }}
              onPass={() => {
                setNoteFor({ kind: "pass", company: c });
                setNoteOpen(true);
              }}
              onReset={() =>
                run(c, () => resetCompany({ companyId: c.id }), `Moved ${c.name} back to review`)
              }
            />
          </div>
        ))}
      </div>

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

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteFor?.kind === "shortlist" ? "Shortlist" : "Pass on"} {noteFor?.company.name}
            </DialogTitle>
            <DialogDescription>Add a note if you like. You can skip it.</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmNote();
            }}
            placeholder={
              noteFor?.kind === "pass" ? "Why pass? (optional)" : "What caught your eye? (optional)"
            }
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmNote}>
              {noteFor?.kind === "shortlist" ? "Shortlist" : "Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <CompanyDetail
              company={detail.company}
              data={detail.data}
              onWarmPathsChange={() => startTransition(() => router.refresh())}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function CompanyDetail({
  company,
  data,
  onWarmPathsChange
}: {
  company: RadarCompany;
  data: Detail | null;
  onWarmPathsChange: () => void;
}) {
  const c = data?.company ?? company;
  const facts = [
    ["Stage", c.stage],
    ["Cohort", c.cohortYear ? String(c.cohortYear) : null],
    ["First seen", formatDate(c.firstSeenAt)]
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="space-y-6 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle className="text-xl">{c.name}</SheetTitle>
        {c.website && (
          <SheetDescription asChild>
            <a
              href={c.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {c.domain ?? c.website}
              <ExternalLinkIcon className="size-3" />
            </a>
          </SheetDescription>
        )}
      </SheetHeader>

      {c.description && <p className="text-sm leading-relaxed">{c.description}</p>}

      {c.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.categories.map((cat) => (
            <Badge key={cat} variant="outline">
              {cat}
            </Badge>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3 text-sm">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-xs">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {c.statusNote && (
        <div className="bg-muted rounded-md p-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs">Your note</p>
          {c.statusNote}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Sources</h3>
        {data ? (
          <ul className="space-y-1.5 text-sm">
            {data.sightings.map((s) => (
              <li key={s.source} className="flex items-center justify-between gap-2">
                {s.link ? (
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {s.source}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <span>{s.source}</span>
                )}
                <span className="text-muted-foreground text-xs">seen {formatDate(s.seenAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
      </section>

      <WarmPaths company={c} onChange={onWarmPathsChange} />
    </div>
  );
}

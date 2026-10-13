"use client";

import { format } from "date-fns";
import { CopyIcon, FeatherIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { buildVoiceGuide, gatherVoiceSamples, updateVoiceGuide } from "@/actions/server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  copyBlock,
  SAMPLE_SOURCES,
  SAMPLES_TOTAL_MAX,
  SOURCE_LABELS,
  VOICE_GUIDE_MAX,
  VOICE_GUIDE_TEXT_MAX,
  type SampleRef,
  type SampleSource,
  type VoiceSample
} from "@/lib/voice-guide";

type Stored = { guide: string; sources: SampleRef[]; updatedAt: Date | null };
type SampleStatus = "included" | "not_connected" | "none" | "unavailable";
type Gathered = { samples: VoiceSample[]; gmail: SampleStatus; website: SampleStatus };

const number = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Apple Notes are often jottings, so they start unticked; everything else starts ticked.
const pickedByDefault = (s: VoiceSample) => s.source !== "notes";

const SOURCE_NOUN: Record<SampleSource, [string, string]> = {
  gmail: ["sent email", "sent emails"],
  website: ["website page", "website pages"],
  business: ["business profile section", "business profile sections"],
  notes: ["note", "notes"]
};

function sourcesSummary(sources: SampleRef[]) {
  const parts = SAMPLE_SOURCES.map((s) => {
    const n = sources.filter((r) => r.source === s).length;
    return n ? `${n} ${SOURCE_NOUN[s][n === 1 ? 0 : 1]}` : null;
  }).filter(Boolean);
  return parts.join(", ");
}

function SampleItem({
  sample,
  checked,
  onChange
}: {
  sample: VoiceSample;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const long = sample.text.length > 240;
  const id = `sample-${sample.id}`;
  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium break-words">
          {sample.label}
        </label>
        <p
          className={`text-muted-foreground text-sm break-words whitespace-pre-line ${
            open ? "" : "line-clamp-3"
          }`}
        >
          {sample.text}
        </p>
        {long && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? "Show less" : "Show all"}
          </Button>
        )}
      </div>
    </li>
  );
}

function GatherNotes({ gathered }: { gathered: Gathered }) {
  const notes: React.ReactNode[] = [];
  if (gathered.gmail === "not_connected") {
    notes.push(
      <>
        Your sent email isn’t included because Google isn’t connected.{" "}
        <Link href="/settings" className="underline underline-offset-2">
          Sync Google in Settings
        </Link>{" "}
        to add it.
      </>
    );
  } else if (gathered.gmail === "unavailable") {
    notes.push("Gmail didn’t respond, so your sent email isn’t included. Try again later.");
  }
  if (gathered.website === "unavailable") {
    notes.push("Your website didn’t load, so its copy isn’t included.");
  } else if (gathered.website === "none") {
    notes.push(
      <>
        Add your website to your{" "}
        <Link href="/settings/business" className="underline underline-offset-2">
          business profile
        </Link>{" "}
        to include its copy.
      </>
    );
  }
  if (!notes.length) return null;
  return (
    <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

export function VoiceGuideEditor({ initial }: { initial: Stored }) {
  const [stored, setStored] = useState(initial);
  const [draft, setDraft] = useState(initial.guide);
  const [saving, startSave] = useTransition();
  const [gathering, startGather] = useTransition();
  const [building, startBuild] = useTransition();
  const [gathered, setGathered] = useState<Gathered | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const dirty = draft.trim() !== stored.guide;
  const chosen = useMemo(
    () => gathered?.samples.filter((s) => picked.has(s.id)) ?? [],
    [gathered, picked]
  );
  const chosenChars = chosen.reduce((n, s) => n + s.text.length, 0);
  const block = copyBlock(draft);

  const save = () =>
    startSave(async () => {
      const result = await updateVoiceGuide({ guide: draft });
      if (!result.ok) return void toast.error(result.error.message);
      const { changed, ...next } = result.data;
      setStored(next);
      setDraft(next.guide);
      toast.success(changed ? "Voice guide saved." : "No changes to save.");
    });

  const gather = () =>
    startGather(async () => {
      const result = await gatherVoiceSamples();
      if (!result.ok) return void toast.error(result.error.message);
      setGathered(result.data);
      setPicked(new Set(result.data.samples.filter(pickedByDefault).map((s) => s.id)));
    });

  const build = () =>
    startBuild(async () => {
      setConfirming(false);
      const result = await buildVoiceGuide({ samples: chosen });
      if (!result.ok) return void toast.error(result.error.message);
      setStored(result.data);
      setDraft(result.data.guide);
      setGathered(null);
      toast.success("Your voice guide is ready. Read it through and change anything that’s off.");
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block);
      toast.success("Copied. Paste it into ChatGPT or Claude.");
    } catch {
      toast.error("Couldn’t copy. Select the text and copy it instead.");
    }
  };

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Your voice guide</CardTitle>
          <CardDescription>
            How you write. The AI follows it whenever it drafts something for you: emails,
            follow-ups, posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            aria-label="Voice guide"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={VOICE_GUIDE_TEXT_MAX}
            placeholder="No voice guide yet. Build one from your writing below, or write it here yourself: the words you use, how long your sentences run, how warm you are, how you sign off."
            className="min-h-72 leading-relaxed"
          />
          <div className="text-muted-foreground flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
            <span>
              {stored.updatedAt ? (
                <span suppressHydrationWarning>
                  Updated {format(stored.updatedAt, "MMM d, yyyy")}
                  {stored.sources.length > 0 && ` · built from ${sourcesSummary(stored.sources)}`}
                </span>
              ) : (
                "Not saved yet"
              )}
            </span>
            <span className={draft.length > VOICE_GUIDE_MAX ? "text-amber-600" : undefined}>
              {number.format(draft.length)} characters
              {draft.length > VOICE_GUIDE_MAX &&
                ` · the AI reads the first ${number.format(VOICE_GUIDE_MAX)}`}
            </span>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-3">
          {dirty && <span className="text-muted-foreground text-sm">Unsaved changes</span>}
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Build from my writing</CardTitle>
          <CardDescription>
            Gathers emails you sent recently, your website, your business profile and longer Apple
            Notes. Tick the ones that sound most like you, and one AI pass turns them into a guide.
            Nothing is kept until you build.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!gathered ? (
            <Button variant="outline" onClick={gather} disabled={gathering}>
              {gathering ? <Spinner /> : <FeatherIcon />}
              {gathering ? "Gathering your writing…" : "Gather my writing"}
            </Button>
          ) : gathered.samples.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm">No writing found yet.</p>
              <GatherNotes gathered={gathered} />
            </div>
          ) : (
            <div className="space-y-5">
              <GatherNotes gathered={gathered} />
              {SAMPLE_SOURCES.map((source) => {
                const items = gathered.samples.filter((s) => s.source === source);
                if (!items.length) return null;
                const on = items.filter((s) => picked.has(s.id)).length;
                return (
                  <section key={source} className="space-y-2" aria-label={SOURCE_LABELS[source]}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">
                        {SOURCE_LABELS[source]}{" "}
                        <span className="text-muted-foreground font-normal">
                          {on} of {items.length}
                        </span>
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            const all = on === items.length;
                            for (const s of items) {
                              if (all) next.delete(s.id);
                              else next.add(s.id);
                            }
                            return next;
                          })
                        }
                      >
                        {on === items.length ? "Untick all" : "Tick all"}
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {items.map((s) => (
                        <SampleItem
                          key={s.id}
                          sample={s}
                          checked={picked.has(s.id)}
                          onChange={(v) => toggle(s.id, v)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
        {gathered && gathered.samples.length > 0 && (
          <CardFooter className="bg-background/95 sticky bottom-0 z-10 flex-wrap justify-between gap-3 border-t pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
            <span className="text-muted-foreground text-sm">
              {plural(chosen.length, "sample")} picked
              {chosenChars > SAMPLES_TOTAL_MAX &&
                ` · the AI reads the first ${number.format(SAMPLES_TOTAL_MAX)} characters`}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setGathered(null)} disabled={building}>
                Cancel
              </Button>
              <Button
                onClick={() => (stored.guide || draft.trim() ? setConfirming(true) : build())}
                disabled={building || chosen.length === 0}
              >
                {building ? <Spinner /> : <SparklesIcon />}
                {building ? "Building…" : "Build my voice guide"}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Copy for ChatGPT or Claude</CardTitle>
          <CardDescription>
            Paste this into ChatGPT’s custom instructions or your Claude profile preferences, so
            they write like you too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {block ? (
            <>
              <pre
                aria-label="Text to copy"
                className="bg-muted/50 max-h-72 overflow-auto rounded-md border p-3 font-sans text-sm break-words whitespace-pre-wrap select-all"
              >
                {block}
              </pre>
              <p className="text-muted-foreground text-xs">
                {number.format(block.length)} characters
                {block.length > VOICE_GUIDE_MAX &&
                  `. ChatGPT’s custom instructions hold ${number.format(VOICE_GUIDE_MAX)}, so shorten the guide to fit there.`}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Your guide appears here once you have one.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={copy} disabled={!block}>
            <CopyIcon />
            Copy
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your voice guide?</AlertDialogTitle>
            <AlertDialogDescription>
              The new guide replaces the one you have now, including any edits. You can change the
              new one afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my guide</AlertDialogCancel>
            <AlertDialogAction onClick={build}>Replace it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

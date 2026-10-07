"use client";

import { format } from "date-fns";
import {
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  FileTextIcon,
  FileUpIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateGrantApplication } from "@/actions/server";
import type { GrantApplication } from "@/actions/grant-applications";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  copyAllText,
  FALLBACK_ASK,
  overLimit,
  PASTED_MAX,
  STEP_LABELS,
  wordCount,
  type DraftStep,
  type GrantQuestion
} from "@/lib/grant-application";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { cn } from "@/lib/utils";

// Phone tap targets are 44px; desktop keeps the kit's compact buttons.
const TAP = "h-11 md:h-9";
const UPLOAD_MAX_MB = 4;

type DraftEvent =
  | { type: "step"; step: DraftStep }
  | { type: "done"; status: string }
  | { type: "error"; message: string };

const STATUS_LABEL: Record<GrantApplication["status"], string> = {
  needs_questions: "Needs the questions",
  drafted: "Draft",
  edited: "Edited"
};

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error("Couldn’t copy. Select the text and copy it instead.");
  }
}

// Runs a draft through the streaming route and reports each step as it starts.
async function runDraft(grantId: string, body: BodyInit | null, onStep: (s: DraftStep) => void) {
  const res = await fetch(`/api/grants/${encodeURIComponent(grantId)}/draft`, {
    method: "POST",
    body: body ?? "{}",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }
  });
  if (!res.ok || !res.body) {
    throw new Error(res.status === 401 ? "Please sign in again." : "The draft couldn’t start.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let outcome: DraftEvent | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as DraftEvent;
      if (event.type === "step") onStep(event.step);
      else outcome = event;
    }
    if (done) break;
  }
  if (!outcome) throw new Error("The draft stopped before it finished. Try again.");
  if (outcome.type === "error") throw new Error(outcome.message);
  return outcome.status;
}

function Progress({ steps }: { steps: DraftStep[] }) {
  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle>Drafting your application</CardTitle>
        <CardDescription>This takes up to a minute or two. Keep this page open.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {(steps.length ? steps : (["reading_page"] as DraftStep[])).map((s, i, all) => {
            const current = i === all.length - 1;
            return (
              <li key={s} className="flex items-center gap-2 text-sm">
                {current ? (
                  <Spinner className="size-4" />
                ) : (
                  <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
                )}
                <span className={current ? "font-medium" : "text-muted-foreground"}>
                  {STEP_LABELS[s]}
                  {current ? "…" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

// The fallback when the questions can't be read: paste them, or upload the application PDF.
function ProvideQuestions({
  busy,
  onPaste,
  onUpload
}: {
  busy: boolean;
  onPaste: (text: string) => void;
  onUpload: (file: File) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const tooBig = file != null && file.size > UPLOAD_MAX_MB * 1024 * 1024;

  return (
    <Tabs defaultValue="upload" className="w-full min-w-0">
      <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto">
        <TabsTrigger value="upload" className={TAP}>
          <FileUpIcon />
          Upload the PDF
        </TabsTrigger>
        <TabsTrigger value="paste" className={TAP}>
          <ClipboardListIcon />
          Paste the questions
        </TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="space-y-3 pt-2">
        <p className="text-muted-foreground text-sm">
          Download the application from the funder’s site (sign in there if you need to), then
          upload it here. PDF or Word, up to {UPLOAD_MAX_MB} MB.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          className="sr-only"
          aria-label="Application PDF"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className={TAP}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <FileTextIcon />
            {file ? "Choose another file" : "Choose file"}
          </Button>
          {file && (
            <span className="text-muted-foreground min-w-0 text-sm break-all">{file.name}</span>
          )}
        </div>
        {tooBig && (
          <p className="text-destructive text-sm">
            That file is over {UPLOAD_MAX_MB} MB. Paste the questions instead.
          </p>
        )}
        <Button
          type="button"
          className={cn(TAP, "w-full sm:w-auto")}
          disabled={!file || tooBig || busy}
          onClick={() => file && onUpload(file)}
        >
          <SparklesIcon />
          Draft from this file
        </Button>
      </TabsContent>
      <TabsContent value="paste" className="space-y-3 pt-2">
        <label htmlFor="pasted-questions" className="text-muted-foreground block text-sm">
          Paste the funder’s questions, with any word or character limits.
        </label>
        <Textarea
          id="pasted-questions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={PASTED_MAX}
          rows={8}
          className="max-h-[50vh] min-h-40"
          placeholder={
            "1. Describe your project (250 words)\n2. Who will benefit? (1,000 characters)"
          }
        />
        <Button
          type="button"
          className={cn(TAP, "w-full sm:w-auto")}
          disabled={!text.trim() || busy}
          onClick={() => onPaste(text)}
        >
          <SparklesIcon />
          Draft from these questions
        </Button>
      </TabsContent>
    </Tabs>
  );
}

function LimitCount({ q, answer }: { q: GrantQuestion; answer: string }) {
  const over = overLimit(q, answer);
  const words = wordCount(answer);
  const text = q.maxWords
    ? `${words} / ${q.maxWords} words`
    : q.maxChars
      ? `${answer.length} / ${q.maxChars} characters`
      : `${words} ${words === 1 ? "word" : "words"}`;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        over ? "text-destructive font-medium" : "text-muted-foreground"
      )}
    >
      {text}
      {over ? " (over the limit)" : ""}
    </span>
  );
}

export function ApplicationEditor({
  grantId,
  grantTitle,
  hasListing,
  application
}: {
  grantId: string;
  grantTitle: string;
  hasListing: boolean;
  application: GrantApplication | null;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<DraftStep[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  const questions = application?.questions ?? [];
  const answerOf = (q: GrantQuestion) => answers[q.id] ?? q.answer;
  const changed = questions.filter((q) => answers[q.id] != null && answers[q.id] !== q.answer);
  const dirty = changed.length > 0;
  const running = steps != null;
  useUnsavedChangesGuard(dirty, setLeaveTo);

  const draft = async (body: BodyInit | null) => {
    setSteps([]);
    try {
      const status = await runDraft(grantId, body, (s) =>
        setSteps((prev) => (prev && !prev.includes(s) ? [...prev, s] : prev))
      );
      setAnswers({});
      setShowFallback(false);
      if (status === "needs_questions") toast.warning("The questions couldn’t be read.");
      else toast.success("Your draft is ready. Read it through and change anything that’s off.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSteps(null);
    }
  };
  const paste = (text: string) => draft(JSON.stringify({ questions: text }));
  const upload = (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return draft(form);
  };

  const save = () =>
    startSave(async () => {
      const result = await updateGrantApplication({
        grantId,
        answers: changed.map((q) => ({ id: q.id, answer: answers[q.id] }))
      });
      if (!result.ok) return void toast.error(result.error.message);
      setAnswers({});
      toast.success("Answers saved.");
    });

  if (running) return <Progress steps={steps} />;

  // No draft yet.
  if (!application) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
          <CardDescription>
            {hasListing
              ? "Reads the funder’s page and its application PDFs, finds every question and its limit, and drafts an answer to each from your business profile and voice guide. Nothing is sent to the funder."
              : `This grant has no listing link to read. ${FALLBACK_ASK}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasListing ? (
            <Button className={cn(TAP, "w-full sm:w-auto")} onClick={() => draft(null)}>
              <SparklesIcon />
              Draft application
            </Button>
          ) : (
            <ProvideQuestions busy={running} onPaste={paste} onUpload={upload} />
          )}
        </CardContent>
      </Card>
    );
  }

  const needsQuestions = !questions.length;
  const readSources = application.sources.filter((s) => s.read);

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="application-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="application-heading" className="text-xl font-semibold">
            Application
          </h2>
          <Badge variant={needsQuestions ? "warning" : "secondary"}>
            {STATUS_LABEL[application.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          Updated {format(application.updatedAt, "MMM d, h:mm a")}
        </p>
      </div>

      {application.note && (
        <Alert className={needsQuestions ? "border-orange-400 bg-orange-50 text-orange-900 dark:bg-orange-900/40 dark:text-orange-50" : undefined}>
          <TriangleAlertIcon />
          <AlertTitle>The questions couldn’t be read</AlertTitle>
          <AlertDescription>{application.note}</AlertDescription>
        </Alert>
      )}

      {needsQuestions ? (
        <Card>
          <CardContent className="pt-6">
            <ProvideQuestions busy={running} onPaste={paste} onUpload={upload} />
          </CardContent>
          {hasListing && (
            <CardFooter>
              <Button variant="ghost" className={TAP} onClick={() => draft(null)}>
                <RefreshCwIcon />
                Try the funder’s page again
              </Button>
            </CardFooter>
          )}
        </Card>
      ) : (
        <>
          <div className="bg-background/95 sticky top-[var(--header-height,3.5rem)] z-10 -mx-1 flex flex-wrap gap-2 px-1 py-2 backdrop-blur">
            <Button
              className={cn(TAP, "flex-1 sm:flex-none")}
              onClick={save}
              disabled={!dirty || saving}
            >
              {saving ? <Spinner /> : <CheckIcon />}
              {dirty ? `Save ${changed.length === 1 ? "change" : "changes"}` : "Saved"}
            </Button>
            <Button
              variant="outline"
              className={cn(TAP, "flex-1 sm:flex-none")}
              onClick={() =>
                copyText(
                  copyAllText(
                    grantTitle,
                    questions.map((q) => ({ ...q, answer: answerOf(q) }))
                  ),
                  "All answers copied."
                )
              }
            >
              <CopyIcon />
              Copy all
            </Button>
          </div>

          <ol className="space-y-4">
            {questions.map((q, i) => {
              const answer = answerOf(q);
              const fieldId = `answer-${q.id}`;
              return (
                <li key={q.id}>
                  <Card className="gap-3 py-4">
                    <CardHeader className="px-4">
                      <label htmlFor={fieldId} className="font-medium break-words">
                        <span className="text-muted-foreground mr-1.5 tabular-nums">{i + 1}.</span>
                        {q.question}
                      </label>
                      {q.limit && (
                        <Badge variant="outline" className="w-fit">
                          Limit: {q.limit}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2 px-4">
                      <Textarea
                        id={fieldId}
                        value={answer}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        className="min-h-20"
                        aria-invalid={overLimit(q, answer) || undefined}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <LimitCount q={q} answer={answer} />
                        <Button
                          variant="ghost"
                          className={TAP}
                          onClick={() => copyText(answer, `Answer ${i + 1} copied.`)}
                          aria-label={`Copy answer ${i + 1}`}
                        >
                          <CopyIcon />
                          Copy
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>

          {readSources.length > 0 && (
            <div className="text-muted-foreground space-y-1 text-sm">
              <p className="font-medium">Questions read from</p>
              <ul className="list-disc space-y-1 pl-5">
                {readSources.map((s, i) => (
                  <li key={i} className="break-words">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center underline underline-offset-2 md:min-h-0"
                      >
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
            {hasListing && (
              <Button variant="outline" className={TAP} onClick={() => setConfirmRedraft(true)}>
                <RefreshCwIcon />
                Draft again
              </Button>
            )}
            <Button
              variant="ghost"
              className={TAP}
              onClick={() => setShowFallback((v) => !v)}
              aria-expanded={showFallback}
            >
              <ClipboardListIcon />
              Wrong questions? Upload or paste them
            </Button>
          </div>
          {showFallback && (
            <Card>
              <CardContent className="pt-6">
                <ProvideQuestions busy={running} onPaste={paste} onUpload={upload} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={confirmRedraft} onOpenChange={setConfirmRedraft}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Draft the application again?</AlertDialogTitle>
            <AlertDialogDescription>
              The funder’s page is read again and every answer is rewritten. Your current answers,
              including your edits, are replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={TAP}>Keep my answers</AlertDialogCancel>
            <AlertDialogAction
              className={TAP}
              onClick={() => {
                setConfirmRedraft(false);
                void draft(null);
              }}
            >
              Draft again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveTo != null} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answers you haven’t saved. They’ll be lost if you leave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={TAP}>Stay</AlertDialogCancel>
            <AlertDialogAction
              className={TAP}
              onClick={() => {
                const href = leaveTo;
                setAnswers({});
                setLeaveTo(null);
                if (href) setTimeout(() => router.push(href), 0);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

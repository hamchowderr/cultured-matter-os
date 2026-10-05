"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";

import { updateBusinessProfile } from "@/actions/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileFields } from "@/lib/business-profile";

// The form's own shape: text as "" rather than null, yes/no questions as a three-way choice
// (not answered yet, yes, no), and row lists as objects for useFieldArray.
const answer = z.enum(["unanswered", "yes", "no"]);
const formSchema = z.object({
  name: z.string().max(300),
  tagline: z.string().max(300),
  mission: z.string().max(10_000),
  story: z.string().max(10_000),
  founderName: z.string().max(300),
  founderBio: z.string().max(10_000),
  entityType: z.string().max(300),
  entityState: z.string().max(300),
  ein: z.string().max(300),
  samUei: z.string().max(300),
  address: z.string().max(300),
  foundedOn: z.string().max(300),
  teamSize: z.string().max(300),
  revenueStage: z.string().max(300),
  womanOwned: answer,
  minorityOwned: answer,
  sectors: z.array(z.string()),
  fitCriteria: z.array(
    z.object({ value: z.string().max(500, "Keep each criterion under 500 characters.") })
  ),
  targetBrands: z.array(z.string()),
  people: z.array(
    z
      .object({
        name: z.string().max(200, "Keep the name under 200 characters."),
        role: z.string().max(300, "Keep the role under 300 characters.")
      })
      // A row with only a role would be dropped on save; ask for the name instead.
      .refine((p) => p.name.trim() || !p.role.trim(), {
        path: ["name"],
        message: "Add a name, or remove this row."
      })
  ),
  website: z.string().max(300),
  socialLinks: z.array(z.string()),
  notes: z.string().max(10_000)
});
type FormValues = z.infer<typeof formSchema>;

const toAnswer = (v: boolean | null) => (v == null ? "unanswered" : v ? "yes" : "no");
const fromAnswer = (v: FormValues["womanOwned"]) => (v === "unanswered" ? null : v === "yes");

function toForm(p: ProfileFields): FormValues {
  return {
    name: p.name ?? "",
    tagline: p.tagline ?? "",
    mission: p.mission ?? "",
    story: p.story ?? "",
    founderName: p.founderName ?? "",
    founderBio: p.founderBio ?? "",
    entityType: p.entityType ?? "",
    entityState: p.entityState ?? "",
    ein: p.ein ?? "",
    samUei: p.samUei ?? "",
    address: p.address ?? "",
    foundedOn: p.foundedOn ?? "",
    teamSize: p.teamSize ?? "",
    revenueStage: p.revenueStage ?? "",
    womanOwned: toAnswer(p.womanOwned),
    minorityOwned: toAnswer(p.minorityOwned),
    sectors: p.sectors,
    fitCriteria: p.fitCriteria.map((value) => ({ value })),
    targetBrands: p.targetBrands,
    people: p.people,
    website: p.website ?? "",
    socialLinks: p.socialLinks,
    notes: p.notes ?? ""
  };
}

function fromForm(v: FormValues): ProfileFields {
  const text = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: text(v.name),
    tagline: text(v.tagline),
    mission: text(v.mission),
    story: text(v.story),
    founderName: text(v.founderName),
    founderBio: text(v.founderBio),
    entityType: text(v.entityType),
    entityState: text(v.entityState),
    ein: text(v.ein),
    samUei: text(v.samUei),
    address: text(v.address),
    foundedOn: text(v.foundedOn),
    teamSize: text(v.teamSize),
    revenueStage: text(v.revenueStage),
    womanOwned: fromAnswer(v.womanOwned),
    minorityOwned: fromAnswer(v.minorityOwned),
    sectors: v.sectors,
    fitCriteria: v.fitCriteria.map((c) => c.value.trim()).filter(Boolean),
    targetBrands: v.targetBrands,
    people: v.people
      .map((p) => ({ name: p.name.trim(), role: p.role.trim() }))
      .filter((p) => p.name),
    website: text(v.website),
    socialLinks: v.socialLinks,
    notes: text(v.notes)
  };
}

const WAITING = "Waiting for your answer.";
// The longest single chip (a sector, a brand, a link) and the most chips in one list.
const CHIP_MAX = 200;
const CHIPS_MAX = 100;

function Section({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

type TextName = {
  [K in keyof FormValues]: FormValues[K] extends string ? K : never;
}[keyof FormValues];

function TextField({
  control,
  name,
  label,
  placeholder,
  multiline,
  wide,
  waiting
}: {
  control: Control<FormValues>;
  name: TextName;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  wide?: boolean;
  // A company detail she hasn't given yet: shows the gentle hint while it is empty.
  waiting?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={wide ? "sm:col-span-2" : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <Textarea rows={5} placeholder={placeholder} {...field} />
            ) : (
              <Input placeholder={placeholder} {...field} />
            )}
          </FormControl>
          {waiting && !String(field.value).trim() && <FormDescription>{WAITING}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function AnswerField({
  control,
  name,
  label
}: {
  control: Control<FormValues>;
  name: "womanOwned" | "minorityOwned";
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="unanswered">Not answered yet</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
          {field.value === "unanswered" && <FormDescription>{WAITING}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// A list edited as chips: type and press Enter (or Add); the x removes one.
function ChipsField({
  control,
  name,
  label,
  placeholder,
  description
}: {
  control: Control<FormValues>;
  name: "sectors" | "targetBrands" | "socialLinks";
  label: string;
  placeholder: string;
  description?: string;
}) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const add = () => {
          const value = draft.trim();
          if (!value) return;
          if (value.length > CHIP_MAX) {
            return setProblem(`That's ${value.length} characters. Keep it under ${CHIP_MAX}.`);
          }
          if (field.value.length >= CHIPS_MAX) {
            return setProblem(`This list holds up to ${CHIPS_MAX}. Remove one to add another.`);
          }
          setProblem(null);
          if (!field.value.some((v) => v.toLowerCase() === value.toLowerCase())) {
            field.onChange([...field.value, value]);
          }
          setDraft("");
        };
        return (
          <FormItem className="sm:col-span-2">
            <FormLabel>{label}</FormLabel>
            {field.value.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={label}>
                {field.value.map((v) => (
                  <li key={v} className="max-w-full">
                    <Badge variant="secondary" className="h-7 max-w-full gap-1 pr-1 text-sm">
                      <span className="truncate">{v}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 rounded-full"
                        aria-label={`Remove ${v}`}
                        onClick={() => field.onChange(field.value.filter((x) => x !== v))}
                      >
                        <XIcon />
                      </Button>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <FormControl>
                <Input
                  value={draft}
                  placeholder={placeholder}
                  aria-invalid={problem ? true : undefined}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (problem) setProblem(null);
                  }}
                  onBlur={field.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                  }}
                />
              </FormControl>
              <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
                <PlusIcon />
                Add
              </Button>
            </div>
            {description && <FormDescription>{description}</FormDescription>}
            {problem ? (
              <p role="alert" className="text-destructive text-sm">
                {problem}
              </p>
            ) : (
              <FormMessage />
            )}
          </FormItem>
        );
      }}
    />
  );
}

export function BusinessProfileForm({ initial }: { initial: ProfileFields }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toForm(initial)
  });
  const { control } = form;
  const criteria = useFieldArray({ control, name: "fitCriteria" });
  const people = useFieldArray({ control, name: "people" });

  const onSubmit = (values: FormValues) =>
    startTransition(async () => {
      const result = await updateBusinessProfile(fromForm(values));
      if (!result.ok) return void toast.error(result.error.message);
      // The result leaves out the EIN and SAM UEI, so keep what she submitted as the new baseline.
      form.reset(toForm(fromForm(values)));
      toast.success(result.data.changed.length ? "Business profile saved." : "No changes to save.");
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Section title="About" description="What Cultured Matter is, in your words.">
          <TextField control={control} name="name" label="Business name" />
          <TextField control={control} name="tagline" label="Tagline" />
          <TextField control={control} name="mission" label="Mission" multiline wide />
          <TextField control={control} name="story" label="Story" multiline wide />
          <TextField control={control} name="founderName" label="Founder" />
          <div className="hidden sm:block" />
          <TextField control={control} name="founderBio" label="Founder bio" multiline wide />
        </Section>

        <Section
          title="Company details"
          description="Grant applications ask for these. Fill them in when you have them."
        >
          <TextField
            control={control}
            name="entityType"
            label="Legal entity type"
            placeholder="e.g. LLC or PBC"
            waiting
          />
          <TextField
            control={control}
            name="entityState"
            label="State of formation"
            placeholder="e.g. California"
            waiting
          />
          <TextField control={control} name="ein" label="EIN" placeholder="XX-XXXXXXX" waiting />
          <TextField control={control} name="samUei" label="SAM.gov UEI" waiting />
          <TextField control={control} name="address" label="Business address" wide waiting />
          <TextField
            control={control}
            name="foundedOn"
            label="Founded"
            placeholder="e.g. month and year"
            waiting
          />
          <TextField control={control} name="teamSize" label="Team size" waiting />
          <TextField
            control={control}
            name="revenueStage"
            label="Revenue stage"
            placeholder="e.g. pre-revenue"
            waiting
          />
          <div className="hidden sm:block" />
          <AnswerField control={control} name="womanOwned" label="Woman-owned" />
          <AnswerField control={control} name="minorityOwned" label="Minority-owned" />
        </Section>

        <Section title="Focus" description="Where you work and what makes a project a fit.">
          <ChipsField control={control} name="sectors" label="Sectors" placeholder="Add a sector" />
          <div className="grid gap-2 sm:col-span-2" role="group" aria-labelledby="fit-criteria">
            <Label id="fit-criteria">Fit criteria</Label>
            <ol className="space-y-2">
              {criteria.fields.map((row, i) => (
                <li key={row.id} className="flex items-start gap-2">
                  <span className="text-muted-foreground w-5 shrink-0 pt-1.5 text-right text-sm tabular-nums">
                    {i + 1}.
                  </span>
                  <FormField
                    control={control}
                    name={`fitCriteria.${i}.value`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Textarea
                            rows={1}
                            className="min-h-8 resize-none py-1.5"
                            aria-label={`Fit criterion ${i + 1}`}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove fit criterion ${i + 1}`}
                    onClick={() => criteria.remove(i)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ol>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => criteria.append({ value: "" }, { shouldFocus: true })}
              >
                <PlusIcon />
                Add a criterion
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">Short statements, most important first.</p>
          </div>
          <ChipsField
            control={control}
            name="targetBrands"
            label="Target brands"
            placeholder="Add a brand"
          />
        </Section>

        <Section
          title="People and partners"
          description="Who is part of Cultured Matter, and where to find it online."
        >
          <div className="grid gap-2 sm:col-span-2" role="group" aria-labelledby="key-people">
            <Label id="key-people">Key people and partners</Label>
            <ul className="space-y-3">
              {people.fields.map((row, i) => (
                <li key={row.id} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <FormField
                      control={control}
                      name={`people.${i}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Name" aria-label={`Name ${i + 1}`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name={`people.${i}.role`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Role" aria-label={`Role ${i + 1}`} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${row.name || `person ${i + 1}`}`}
                    onClick={() => people.remove(i)}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => people.append({ name: "", role: "" }, { shouldFocus: true })}
              >
                <PlusIcon />
                Add a person or partner
              </Button>
            </div>
          </div>
          <TextField control={control} name="website" label="Website" placeholder="https://" wide />
          <ChipsField
            control={control}
            name="socialLinks"
            label="Social links"
            placeholder="https://instagram.com/…"
          />
        </Section>

        <Section title="Notes" description="Anything else the AI should know about the business.">
          <TextField control={control} name="notes" label="Notes" multiline wide />
        </Section>

        <div className="bg-background/95 sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 px-1 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          {form.formState.isDirty && (
            <span className="text-muted-foreground text-sm">Unsaved changes</span>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

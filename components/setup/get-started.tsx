import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";

import type { SetupStatus } from "@/actions/setup";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STEPS, stepSummary } from "./steps";

// The Get started checklist on Today (from the UI kit's onboarding-screen8). Each step links to
// where it is done; the whole list goes away once all four are set up.
export function GetStarted({ status }: { status: SetupStatus }) {
  if (status.done >= status.total) return null;

  return (
    <section className="space-y-3">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">Get started</h2>
          <span className="text-muted-foreground text-sm">
            {status.done} of {status.total} set up
          </span>
        </div>
        <Progress
          value={(status.done / status.total) * 100}
          className="h-1.5"
          aria-label={`${status.done} of ${status.total} set up`}
        />
      </header>

      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = status[step.id].done;
          const Icon = step.icon;

          return (
            <li key={step.id}>
              <Link
                href={done ? step.doneHref : step.href}
                className={cn(
                  "bg-muted/40 hover:bg-muted flex w-full items-center gap-4 rounded-lg p-4 transition-colors"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    done
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  )}
                >
                  {done ? <CheckIcon className="size-3.5" /> : <Icon className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span
                    className={cn("block text-sm font-medium", done && "text-muted-foreground")}
                  >
                    {step.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {stepSummary(step.id, status)}
                  </span>
                </span>
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-sm">
                  <span className={cn(!done && "max-sm:sr-only")}>
                    {done ? "Done" : step.todoLabel}
                  </span>
                  {!done && <ArrowRightIcon className="size-3.5" />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import { CalendarDaysIcon, CalendarPlusIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resetCalendarLink } from "@/actions/server";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export const feedUrl = (origin: string, token: string) => `${origin}/api/calendar/${token}.ics`;
// webcal:// makes Apple Calendar open its "Subscribe" sheet for the same address.
export const webcalUrl = (httpsUrl: string) => httpsUrl.replace(/^https?:\/\//, "webcal://");

// Settings card: subscribe Apple Calendar to grant deadlines and task due dates.
export function CalendarFeedCard({ origin, token }: { origin: string; token: string | null }) {
  const [current, setCurrent] = useState(token);
  const [pending, startTransition] = useTransition();
  const url = current ? feedUrl(origin, current) : null;

  const reset = () =>
    startTransition(async () => {
      const result = await resetCalendarLink();
      if (!result.ok) return void toast.error(result.error.message);
      setCurrent(result.data.calendarToken);
      toast.success(
        result.data.replaced
          ? "New calendar link ready. Subscribe again with it; the old one no longer works."
          : "Calendar link ready."
      );
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Calendar link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  return (
    <Card className="gap-0 pb-0 shadow-none">
      <CardContent className="pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="text-muted-foreground flex size-9 items-center justify-center rounded-lg border">
            <CalendarDaysIcon className="size-4" />
          </span>
          <Badge variant={url ? "success" : "outline"}>{url ? "Ready" : "Not set up"}</Badge>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">Calendar</h3>
          <p className="text-muted-foreground text-sm">
            Grant deadlines and task due dates in Apple Calendar. It updates when the calendar
            refreshes. Keep the link private: anyone with it can see these dates.
          </p>
          {url && (
            <p className="text-muted-foreground bg-muted/50 mt-3 truncate rounded-md border px-2 py-1 font-mono text-xs select-all">
              {url}
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-muted/50 flex flex-wrap gap-2 border-t border-dashed px-6 py-4!">
        {url ? (
          <>
            <Button asChild size="sm">
              <a href={webcalUrl(url)}>
                <CalendarPlusIcon />
                Add to Apple Calendar
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={copy}>
              <CopyIcon />
              Copy link
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={pending}>
                  {pending ? <Spinner /> : <RotateCcwIcon />}
                  Reset link
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset the calendar link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The current link stops working, and calendars subscribed with it stop updating.
                    Remove the old calendar in Apple Calendar and add the new link.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={reset}>Reset link</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={reset} disabled={pending}>
            {pending ? <Spinner /> : <CalendarPlusIcon />}
            Create calendar link
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

"use client";

import { MailIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setDailyEmail } from "@/actions/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Settings card: the morning summary email, sent from her Gmail to herself.
export function DailyEmailCard({
  enabled,
  email,
  googleConnected
}: {
  enabled: boolean;
  email: string;
  googleConnected: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setOn(next);
    startTransition(async () => {
      const result = await setDailyEmail({ enabled: next });
      if (!result.ok) {
        setOn(!next);
        return void toast.error(result.error.message);
      }
      toast.success(next ? "Daily email is on." : "Daily email is off.");
    });
  };

  return (
    <Card className="gap-0 pb-0 shadow-none">
      <CardContent className="pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="text-muted-foreground flex size-9 items-center justify-center rounded-lg border">
            <MailIcon className="size-4" />
          </span>
          <Badge variant={on ? "success" : "outline"}>{on ? "On" : "Off"}</Badge>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">Daily email summary</h3>
          <p className="text-muted-foreground text-sm">
            Each morning, an email to {email} with new grants, grants closing this week, new Radar
            finds, replies and approvals. No email on days with nothing new.
          </p>
          {on && !googleConnected && (
            <p className="text-destructive text-sm">
              Connect Google above: the email is sent from your Gmail.
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-muted/50 border-t border-dashed px-6 py-4!">
        <div className="flex items-center gap-3">
          <Switch id="daily-email" checked={on} onCheckedChange={toggle} disabled={pending} />
          <Label htmlFor="daily-email">Daily email summary</Label>
        </div>
      </CardFooter>
    </Card>
  );
}

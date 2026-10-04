"use client";

import { BellIcon, BellOffIcon, SendIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import type { PushPreferences } from "@/actions/push";
import {
  pushStatus,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  setPushPreferences
} from "@/actions/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  currentSubscription,
  isIos,
  pushSupport,
  PushSetupError,
  subscribeThisDevice,
  subscriptionJson
} from "@/lib/push-client";

// What this device can do right now. "checking" until the browser has been asked.
type DeviceState = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

const KINDS: { key: keyof PushPreferences; label: string; hint: string }[] = [
  { key: "daily", label: "Daily summary", hint: "Once each morning when something is new" },
  { key: "replies", label: "Replies", hint: "When someone answers an email you're waiting on" },
  { key: "approvals", label: "Approvals", hint: "When something is waiting for your approval" }
];

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Settings card: allow notifications on this device, pick which kinds, send a test.
export function NotificationsCard({
  configured,
  preferences
}: {
  configured: boolean;
  preferences: PushPreferences;
}) {
  const [device, setDevice] = useState<DeviceState>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(preferences);
  const [ios, setIos] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setIos(isIos());
    const support = pushSupport();
    if (support !== "supported") return setDevice(support);
    if (Notification.permission === "denied") return setDevice("blocked");
    currentSubscription()
      .then(async (sub) => {
        if (!sub) return setDevice("off");
        setEndpoint(sub.endpoint);
        // Known to the server? If not (e.g. it was removed), save it again.
        const status = await pushStatus({ endpoint: sub.endpoint });
        if (status.ok && !status.data.thisDevice) {
          const saved = await savePushSubscription(subscriptionJson(sub));
          if (!saved.ok) return setDevice("off");
        }
        setDevice("on");
      })
      .catch(() => setDevice("off"));
  }, []);

  // No await before subscribeThisDevice: the permission prompt needs this tap.
  const allow = () => {
    const subscribing = subscribeThisDevice(PUBLIC_KEY);
    startTransition(async () => {
      try {
        const sub = await subscribing;
        const saved = await savePushSubscription(subscriptionJson(sub));
        if (!saved.ok) return void toast.error(saved.error.message);
        setEndpoint(sub.endpoint);
        setDevice("on");
        toast.success("Notifications are on for this device.");
      } catch (e) {
        if (Notification.permission === "denied") setDevice("blocked");
        toast.error(e instanceof PushSetupError ? e.message : "Couldn't turn on notifications.");
      }
    });
  };

  const turnOff = () =>
    startTransition(async () => {
      const sub = await currentSubscription();
      const target = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe().catch(() => false);
      if (target) {
        const removed = await removePushSubscription({ endpoint: target });
        if (!removed.ok) return void toast.error(removed.error.message);
      }
      setEndpoint(null);
      setDevice("off");
      toast.success("Notifications are off on this device.");
    });

  const test = () =>
    startTransition(async () => {
      if (!endpoint) return;
      const result = await sendTestPush({ endpoint });
      if (!result.ok) return void toast.error(result.error.message);
      toast.success("Test sent. It should arrive in a few seconds.");
    });

  const toggle = (key: keyof PushPreferences, next: boolean) => {
    setPrefs((p) => ({ ...p, [key]: next }));
    startTransition(async () => {
      const result = await setPushPreferences({ [key]: next });
      if (!result.ok) {
        setPrefs((p) => ({ ...p, [key]: !next }));
        return void toast.error(result.error.message);
      }
      setPrefs(result.data);
    });
  };

  const badge =
    device === "on"
      ? { variant: "success" as const, text: "On" }
      : device === "blocked"
        ? { variant: "destructive" as const, text: "Blocked" }
        : { variant: "outline" as const, text: "Off" };

  return (
    <Card className="gap-0 pb-0 shadow-none">
      <CardContent className="pb-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="text-muted-foreground flex size-9 items-center justify-center rounded-lg border">
            <BellIcon className="size-4" />
          </span>
          {device !== "checking" && <Badge variant={badge.variant}>{badge.text}</Badge>}
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-medium">Notifications</h3>
          <p className="text-muted-foreground text-sm">
            Alerts on this device for the kinds you pick below. The app icon shows how many
            notifications you haven&apos;t read yet.
          </p>
          <p className="text-muted-foreground text-sm">
            On iPhone, add Cultured Matter to your Home Screen first (Share, then Add to Home
            Screen), open it from there, then tap Allow notifications.
          </p>
          {!configured && (
            <p className="text-destructive text-sm">
              Notifications aren&apos;t set up on the server yet.
            </p>
          )}
          {device === "needs-install" && (
            <p className="text-sm font-medium">
              You&apos;re in Safari. Open Cultured Matter from your Home Screen to allow
              notifications.
            </p>
          )}
          {device === "unsupported" && (
            <p className="text-sm font-medium">This browser can&apos;t show notifications.</p>
          )}
          {device === "blocked" && (
            <p className="text-sm font-medium">
              {ios
                ? "Notifications are blocked. Turn them on in the iPhone Settings app: Notifications, then Cultured Matter."
                : "Notifications are blocked for this site. Allow them in the browser's site settings, then reload."}
            </p>
          )}
        </div>
        <div className="mt-5 space-y-3">
          {KINDS.map((k) => (
            <div key={k.key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`push-${k.key}`} className="flex flex-col items-start gap-0.5">
                <span>{k.label}</span>
                <span className="text-muted-foreground text-xs font-normal">{k.hint}</span>
              </Label>
              <Switch
                id={`push-${k.key}`}
                checked={prefs[k.key]}
                onCheckedChange={(next) => toggle(k.key, next)}
                disabled={pending}
              />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="bg-muted/50 flex flex-wrap gap-2 border-t border-dashed px-6 py-4!">
        {device === "on" ? (
          <>
            <Button size="sm" variant="outline" onClick={test} disabled={pending || !configured}>
              {pending ? <Spinner /> : <SendIcon />}
              Send a test
            </Button>
            <Button size="sm" variant="ghost" onClick={turnOff} disabled={pending}>
              <BellOffIcon />
              Turn off on this device
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={allow}
            disabled={pending || !configured || !PUBLIC_KEY || device !== "off"}
          >
            {pending ? <Spinner /> : <BellIcon />}
            Allow notifications
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

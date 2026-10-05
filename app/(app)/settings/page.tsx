import { ArrowRightIcon, Building2Icon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { getBusinessProfile, getUserSettings, pushStatus, setupStatus } from "@/actions/server";
import { CalendarFeedCard } from "@/components/settings/calendar-feed-card";
import { DailyEmailCard } from "@/components/settings/daily-email-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { PageHeader } from "@/components/layout/page-shell";
import { ConnectGoogleDialog } from "@/components/setup/connect-google-dialog";
import { ConnectionCard, type ConnectionState } from "@/components/setup/connection-card";
import { STEPS, stepSummary, type Step } from "@/components/setup/steps";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { generateMeta } from "@/lib/utils";
import { GoogleReturn } from "./google-return";

export async function generateMetadata() {
  return generateMeta({
    title: "Settings",
    description:
      "Your account, your business profile, what is connected (LinkedIn, Google, iPhone, newsletter), the calendar feed, the daily email and notifications."
  });
}

function LinkAction({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>
        {label}
        <ArrowRightIcon />
      </Link>
    </Button>
  );
}

function initials(name: string, email: string) {
  const parts = (name.trim() || email).split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// The address she reached the app on, for the calendar feed link.
async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// The Business card: a load failure says so instead of looking up to date.
function businessCard(business: Awaited<ReturnType<typeof getBusinessProfile>>): {
  description: string;
  state: ConnectionState;
  stateLabel: string;
} {
  const about = "What Cultured Matter is, in one place. The AI reads it.";
  if (!business.ok) {
    return {
      description: `Couldn’t load your business profile: ${business.error.message}`,
      state: "error",
      stateLabel: "Couldn’t load"
    };
  }
  if (business.data.waitingOn.length) {
    return {
      description: `${about} Some company details are waiting for your answer.`,
      state: "waiting",
      stateLabel: "Needs answers"
    };
  }
  return { description: about, state: "connected", stateLabel: "Up to date" };
}

export default async function Page() {
  // Session first: it marks the page as dynamic before any action runs.
  const user = (await getSession())?.user;
  const [status, settings, push, origin, business] = await Promise.all([
    setupStatus({}),
    getUserSettings(),
    pushStatus(),
    requestOrigin(),
    getBusinessProfile()
  ]);

  function action(step: Step, done: boolean) {
    if (done) return <LinkAction href={step.doneHref} label={step.doneLabel} />;
    if (step.id === "google") return <ConnectGoogleDialog />;
    // The newsletter connects once her newsletter site exists; nothing for her to do yet.
    if (step.id === "newsletter") return null;
    return <LinkAction href={step.href} label={step.todoLabel} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <GoogleReturn />
      <PageHeader title="Settings" description="Your account and what is connected." />

      {user && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="bg-card ring-foreground/10 flex items-center gap-4 rounded-xl p-4 ring-1">
            <Avatar className="size-10 rounded-md">
              {user.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback className="rounded-md text-sm">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {user.name && <p className="truncate text-sm font-medium">{user.name}</p>}
              <p className="text-muted-foreground truncate text-sm">{user.email}</p>
            </div>
            <span className="text-muted-foreground hidden text-sm sm:block">
              Signed in with Google
            </span>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Business</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            icon={Building2Icon}
            title="Business profile"
            {...businessCard(business)}
            action={<LinkAction href="/settings/business" label="Open" />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Connections</h2>
          {status.ok && (
            <span className="text-muted-foreground text-sm">
              {status.data.done} of {status.data.total} set up
            </span>
          )}
        </div>
        {status.ok ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((step) => {
              const done = status.data[step.id].done;
              const state: ConnectionState = done
                ? "connected"
                : step.id === "newsletter"
                  ? "waiting"
                  : "not_connected";
              return (
                <ConnectionCard
                  key={step.id}
                  icon={step.icon}
                  title={step.title}
                  description={
                    step.id === "newsletter" && !done
                      ? "Waiting on your newsletter tool. It connects once your newsletter site is ready."
                      : stepSummary(step.id, status.data)
                  }
                  state={state}
                  action={action(step, done)}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-destructive text-sm">
            Couldn’t load your connections: {status.error.message}
          </p>
        )}
      </section>

      {user && settings.ok && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Calendar and email</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <CalendarFeedCard origin={origin} token={settings.data.calendarToken} />
            <DailyEmailCard
              enabled={settings.data.dailyEmail}
              email={user.email}
              googleConnected={status.ok ? status.data.google.done : true}
            />
          </div>
        </section>
      )}

      {user && push.ok && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NotificationsCard
              configured={push.data.configured}
              preferences={push.data.preferences}
            />
          </div>
        </section>
      )}
    </div>
  );
}

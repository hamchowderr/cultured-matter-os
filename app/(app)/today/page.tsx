import { SunIcon } from "lucide-react";
import { cookies } from "next/headers";

import { dueTasks, listApprovals, searchCompanies, searchGrants } from "@/actions/server";
import { CompanyCard, GrantCard } from "@/components/cards";
import { ComingSoon } from "@/components/layout/page-shell";
import { getSession } from "@/lib/session";
import { HOME_TIME_ZONE } from "@/lib/time";
import { generateMeta } from "@/lib/utils";
import { RADAR_BASELINE_COOKIE } from "../radar/constants";
import { Section } from "./section";
import { TodayApprovals } from "./today-approvals";
import { TodayTasks } from "./today-tasks";

export async function generateMetadata() {
  return generateMeta({
    title: "Today",
    description:
      "What needs you today: approvals, tasks due, grants closing soon and new radar finds."
  });
}

const WEEK = 7 * 86_400_000;

function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23"
    }).format(now)
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function Page() {
  const now = new Date();
  const session = await getSession();
  const firstName = session?.user.name.trim().split(/\s+/)[0] ?? "";
  const baselineRaw = (await cookies()).get(RADAR_BASELINE_COOKIE)?.value;
  // Before her first Radar visit, "new" means the last week.
  const since = baselineRaw ? new Date(Number(baselineRaw)) : new Date(now.getTime() - WEEK);

  const [approvals, tasks, grants, radar] = await Promise.all([
    listApprovals({}),
    dueTasks({}),
    searchGrants({ forProfitOnly: true, closingWithinDays: 30, limit: 5 }),
    searchCompanies({ seenSince: since, statuses: ["new"], limit: 4 })
  ]);

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);

  const pending = approvals.ok ? approvals.data.approvals : [];
  const t = tasks.ok ? tasks.data : { overdue: [], today: [], week: [] };
  const taskCount = t.overdue.length + t.today.length + t.week.length;
  const closing = grants.ok ? grants.data.grants : [];
  const finds = radar.ok ? radar.data : { companies: [], total: 0 };
  const nothing =
    pending.length === 0 && taskCount === 0 && closing.length === 0 && finds.total === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting(now)}
          {firstName && `, ${firstName}`}
        </h1>
        <p className="text-muted-foreground text-sm">
          {[
            pending.length && `${pending.length} to approve`,
            t.overdue.length && `${t.overdue.length} overdue`,
            t.today.length && `${t.today.length} due today`,
            closing.length && `${closing.length} grants closing within 30 days`,
            finds.total && `${finds.total} new on Radar`
          ]
            .filter(Boolean)
            .join(" · ") || "Nothing pressing today."}
        </p>
      </header>

      {nothing && (
        <ComingSoon
          icon={SunIcon}
          title="A clear day"
          description="No approvals, due tasks, closing grants or new radar finds right now."
        />
      )}

      {pending.length > 0 && <TodayApprovals approvals={pending} />}

      {taskCount > 0 && (
        <Section title="Tasks" href="/projects" linkLabel="All projects">
          <TodayTasks groups={t} />
        </Section>
      )}

      {closing.length > 0 && (
        <Section
          title="Grants closing within 30 days"
          href="/grants?soon=1"
          linkLabel="Open the board"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {closing.map((g) => (
              <GrantCard key={g.id} grant={g} now={now} />
            ))}
          </div>
        </Section>
      )}

      {finds.total > 0 && (
        <Section
          title={baselineRaw ? "New on Radar since your last visit" : "New on Radar this week"}
          href={baselineRaw ? "/radar?new=1" : "/radar"}
          linkLabel={`See all ${finds.total}`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {finds.companies.map((c) => (
              <CompanyCard key={c.id} company={c} sources={c.sources} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

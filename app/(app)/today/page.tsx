import { CheckSquareIcon, LandmarkIcon, RadarIcon, StampIcon, SunIcon } from "lucide-react";
import { cookies } from "next/headers";

import {
  dueTasks,
  listApprovals,
  radarFindsByWeek,
  searchCompanies,
  searchGrants,
  setupStatus
} from "@/actions/server";
import { CompanyCard } from "@/components/cards";
import { ComingSoon } from "@/components/layout/page-shell";
import { GetStarted } from "@/components/setup/get-started";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { HOME_TIME_ZONE } from "@/lib/time";
import { generateMeta } from "@/lib/utils";
import { RADAR_BASELINE_COOKIE } from "../radar/constants";
import { RadarFindsCard } from "./components/radar-finds-card";
import { StatCard } from "./components/stat-card";
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
const GRANT_CAP = 200;

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

// Layout from the UI kit's default dashboard (app/dashboard/(auth)/default, v2.0.0): a heading row,
// a row of summary cards, then a three-column card grid.
export default async function Page() {
  const now = new Date();
  const session = await getSession();
  const firstName = session?.user.name.trim().split(/\s+/)[0] ?? "";
  const baselineRaw = (await cookies()).get(RADAR_BASELINE_COOKIE)?.value;
  // Before her first Radar visit, "new" means the last week.
  const since = baselineRaw ? new Date(Number(baselineRaw)) : new Date(now.getTime() - WEEK);

  const [approvals, tasks, grants, radar, weekly, setup] = await Promise.all([
    listApprovals({}),
    dueTasks({}),
    searchGrants({ forProfitOnly: true, closingWithinDays: 30, limit: GRANT_CAP }),
    searchCompanies({ seenSince: since, statuses: ["new"], limit: 4 }),
    radarFindsByWeek({ weeks: 8 }),
    setupStatus({})
  ]);

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);
  const shortDate = new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_TIME_ZONE,
    month: "short",
    day: "numeric"
  });

  const pending = approvals.ok ? approvals.data.approvals : [];
  const t = tasks.ok ? tasks.data : { overdue: [], today: [], week: [] };
  const taskCount = t.overdue.length + t.today.length + t.week.length;
  const allClosing = grants.ok ? grants.data.grants : [];
  const nextDeadline = allClosing[0]?.deadline;
  const finds = radar.ok ? radar.data : { companies: [], total: 0 };
  const weeks = weekly.ok ? weekly.data.weeks : [];
  const showChart = weeks.some((w) => w.count > 0);
  const showSetup = setup.ok && setup.data.done < setup.data.total;
  const nothing =
    pending.length === 0 && taskCount === 0 && allClosing.length === 0 && finds.total === 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div
        className="flex flex-row flex-wrap items-end justify-between gap-2"
        data-tour-step-id="today-heading"
      >
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
          {greeting(now)}
          {firstName && `, ${firstName}`}
        </h1>
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
      </div>

      <div
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6"
        data-tour-step-id="today-stats"
      >
        <StatCard
          title="Tasks due this week"
          value={taskCount}
          icon={CheckSquareIcon}
          href="/projects"
          alert={t.overdue.length > 0}
          note={
            t.overdue.length > 0 ? (
              <>
                <span className="text-destructive">{t.overdue.length} overdue</span>
                {t.today.length > 0 && ` · ${t.today.length} due today`}
              </>
            ) : t.today.length > 0 ? (
              `${t.today.length} due today`
            ) : (
              "Nothing overdue"
            )
          }
        />
        <StatCard
          title="Grants closing soon"
          value={allClosing.length >= GRANT_CAP ? `${GRANT_CAP}+` : allClosing.length}
          icon={LandmarkIcon}
          href="/grants?soon=1"
          note={
            nextDeadline
              ? `within 30 days · next on ${shortDate.format(nextDeadline)}`
              : "None closing within 30 days"
          }
        />
        <StatCard
          title="New on Radar"
          value={finds.total}
          icon={RadarIcon}
          href={baselineRaw ? "/radar?new=1" : "/radar"}
          note={baselineRaw ? "since your last visit" : "in the last 7 days"}
        />
        <StatCard
          title="Open approvals"
          value={pending.length}
          icon={StampIcon}
          href={pending.length > 0 ? "#approvals" : "/archive"}
          alert={pending.length > 0}
          note={pending.length > 0 ? "waiting for your decision" : "All decided"}
        />
      </div>

      {showSetup && setup.ok && (
        <Card data-tour-step-id="today-setup">
          <CardContent>
            <GetStarted status={setup.data} />
          </CardContent>
        </Card>
      )}

      {nothing && (
        <ComingSoon
          icon={SunIcon}
          title="A clear day"
          description="No approvals, due tasks, closing grants or new radar finds right now."
        />
      )}

      <div className="gap-4 space-y-4 lg:grid lg:grid-flow-row-dense lg:grid-cols-3 lg:gap-6 lg:space-y-0">
        {pending.length > 0 && <TodayApprovals approvals={pending} className="lg:col-span-2" />}

        {showChart && <RadarFindsCard weeks={weeks} timeZone={HOME_TIME_ZONE} />}

        {taskCount > 0 && (
          <Section
            title="Tasks"
            tourId="today-tasks"
            description="Overdue or due within 7 days"
            href="/projects"
            linkLabel="All projects"
            className="lg:col-span-2"
          >
            <TodayTasks groups={t} />
          </Section>
        )}

        {finds.total > 0 && (
          <Section
            title={baselineRaw ? "New on Radar since your last visit" : "New on Radar this week"}
            tourId="today-radar"
            href={baselineRaw ? "/radar?new=1" : "/radar"}
            linkLabel="See them all"
            className="lg:col-span-3"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {finds.companies.map((c) => (
                <CompanyCard key={c.id} company={c} sources={c.sources} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

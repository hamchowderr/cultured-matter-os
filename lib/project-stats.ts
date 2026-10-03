// Numbers for the Projects overview, worked out from real projects and tasks.
import { HOME_TIME_ZONE, startOfDayIn } from "@/lib/time";

type ProjectLike = { status: "active" | "paused" | "done" };
type TaskLike = {
  status: "todo" | "in_progress" | "waiting" | "replied" | "done";
  createdAt: Date;
  completedAt: Date | null;
};
type DueLike = { overdue: unknown[]; today: unknown[]; week: unknown[] };

export type ProjectStats = {
  activeProjects: number;
  pausedProjects: number;
  dueThisWeek: number;
  overdue: number;
  waiting: number;
  replied: number;
  doneThisMonth: number;
  doneLastMonth: number;
};

export type ActivityPoint = { date: string; created: number; completed: number };

function yearMonthIn(timeZone: string, date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month };
}

// Start of the month `offset` months from the one `now` falls in, in the home time zone.
export function startOfMonthIn(timeZone: string, now: Date, offset = 0) {
  const { y, m } = yearMonthIn(timeZone, now);
  // Noon UTC on the 1st is still the 1st in any US time zone.
  return startOfDayIn(timeZone, new Date(Date.UTC(y, m - 1 + offset, 1, 12)));
}

// "2026-10-03" for the day the instant falls on in the time zone.
export function dayKey(timeZone: string, date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function projectStats(
  projects: ProjectLike[],
  tasks: TaskLike[],
  due: DueLike,
  now = new Date(),
  timeZone = HOME_TIME_ZONE
): ProjectStats {
  const monthStart = startOfMonthIn(timeZone, now).getTime();
  const lastMonthStart = startOfMonthIn(timeZone, now, -1).getTime();
  const doneAt = (t: TaskLike) => (t.status === "done" ? (t.completedAt?.getTime() ?? null) : null);

  return {
    activeProjects: projects.filter((p) => p.status === "active").length,
    pausedProjects: projects.filter((p) => p.status === "paused").length,
    dueThisWeek: due.today.length + due.week.length,
    overdue: due.overdue.length,
    waiting: tasks.filter((t) => t.status === "waiting").length,
    replied: tasks.filter((t) => t.status === "replied").length,
    doneThisMonth: tasks.filter((t) => (doneAt(t) ?? -1) >= monthStart).length,
    doneLastMonth: tasks.filter((t) => {
      const at = doneAt(t);
      return at != null && at >= lastMonthStart && at < monthStart;
    }).length
  };
}

// Tasks added and finished per day for the last `days` days, oldest first.
export function taskActivity(
  tasks: TaskLike[],
  days = 90,
  now = new Date(),
  timeZone = HOME_TIME_ZONE
): ActivityPoint[] {
  const points = new Map<string, ActivityPoint>();
  const today = startOfDayIn(timeZone, now).getTime();
  for (let i = days - 1; i >= 0; i--) {
    // Midday of each day, so daylight-saving shifts never skip or repeat a date.
    const key = dayKey(timeZone, new Date(today - i * 86_400_000 + 12 * 3_600_000));
    points.set(key, { date: key, created: 0, completed: 0 });
  }
  for (const t of tasks) {
    const created = points.get(dayKey(timeZone, t.createdAt));
    if (created) created.created++;
    if (t.status === "done" && t.completedAt) {
      const completed = points.get(dayKey(timeZone, t.completedAt));
      if (completed) completed.completed++;
    }
  }
  return [...points.values()];
}

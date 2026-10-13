import { HOME_TIME_ZONE, startOfDayIn } from "./time";

// Entity types written to activity_log, with the label the Archive shows.
export const ENTITY_TYPES = [
  { value: "company", label: "Company" },
  { value: "contact", label: "Person" },
  { value: "grant", label: "Grant" },
  { value: "project", label: "Project" },
  { value: "task", label: "Task" },
  { value: "capture", label: "Inbox" },
  { value: "approval", label: "Approval" },
  { value: "note", label: "Note" },
  { value: "mind_map", label: "Mind map" }
] as const;

export function entityLabel(type: string) {
  return ENTITY_TYPES.find((t) => t.value === type)?.label ?? type;
}

type Linkable = {
  entityType: string;
  entityId: string | null;
  entity: { name: string; projectId: string | null; projectDone: boolean; filed: boolean } | null;
};

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  return p.toString();
};

// Where a log row's entity can be seen. Only pages that can actually show it get a link:
// Radar opens the company by id, People find it by name, Grants by title (all grants, not
// just for-profit), Projects by id, captures in the Inbox, approvals on Today.
export function activityHref(row: Linkable): string | null {
  const e = row.entity;
  switch (row.entityType) {
    case "company":
      return e
        ? `/radar?${qs({ view: "all", q: e.name, company: row.entityId ?? undefined })}`
        : null;
    case "contact":
      // The LinkedIn import logs no single contact; it belongs on People as a whole.
      if (!row.entityId) return "/people";
      return e ? `/people?${qs({ q: e.name })}` : null;
    case "grant":
      return e ? `/grants?${qs({ q: e.name, all: "1" })}` : null;
    case "project":
    case "task":
      return e?.projectId
        ? `/projects?${qs({ p: e.projectId, done: e.projectDone ? "1" : undefined })}`
        : null;
    case "capture":
      return e ? `/inbox${e.filed ? "?view=filed" : ""}` : null;
    case "approval":
      // Open approvals are decided on Today.
      return e ? "/today" : null;
    case "note":
      // Imports log the batch, not one note; a note written or edited here opens itself.
      return row.entityId ? `/archive/notes?${qs({ note: row.entityId })}` : "/archive/notes";
    case "mind_map":
      return e && row.entityId ? `/map/saved/${row.entityId}` : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Days, in Simone's time zone

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(s: string | undefined): s is string {
  return !!s && ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// Midnight at the start of a YYYY-MM-DD day in the home time zone.
export function startOfIsoDay(day: string, timeZone = HOME_TIME_ZONE): Date {
  // Noon UTC is the same calendar day everywhere in the Americas.
  return startOfDayIn(timeZone, new Date(`${day}T12:00:00Z`));
}

// Noon on a YYYY-MM-DD day in the home time zone: how a task's due date is stored. It is
// the same calendar day in the home zone and in UTC, so a server in either reads it right.
export function noonOfIsoDay(day: string, timeZone = HOME_TIME_ZONE): Date {
  return new Date(startOfIsoDay(day, timeZone).getTime() + 12 * 3_600_000);
}

// Midnight at the end of that day: the exclusive upper bound of a range that includes it.
export function endOfIsoDay(day: string, timeZone = HOME_TIME_ZONE): Date {
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000);
  return startOfDayIn(timeZone, next);
}

// The YYYY-MM-DD of an instant in the home time zone.
export function isoDayIn(date: Date, timeZone = HOME_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dayHeading(day: string, now: Date, timeZone = HOME_TIME_ZONE): string {
  const today = isoDayIn(now, timeZone);
  if (day === today) return "Today";
  const yesterday = isoDayIn(new Date(startOfIsoDay(today, timeZone).getTime() - 1), timeZone);
  if (day === yesterday) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric"
  });
}

export function timeIn(date: Date, timeZone = HOME_TIME_ZONE): string {
  return date.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

// Rows in order, grouped by their day in the home time zone.
export function groupByDay<T extends { at: Date }>(rows: T[], timeZone = HOME_TIME_ZONE) {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = isoDayIn(row.at, timeZone);
    const last = groups.at(-1);
    if (last?.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}

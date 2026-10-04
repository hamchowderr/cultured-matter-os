import ical, { ICalCalendarMethod, ICalEventTransparency } from "ical-generator";

import type { CalendarEvent } from "@/actions/preferences";
import { HOME_TIME_ZONE } from "@/lib/time";

const DAY = 86_400_000;
export const CALENDAR_NAME = "Cultured Matter";

// The calendar date (in her time zone) of an instant, as UTC midnight. ical-generator writes
// all-day dates from the UTC fields, so DTSTART;VALUE=DATE is the day she sees in the app.
export function calendarDay(at: Date, timeZone = HOME_TIME_ZONE) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(at)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// RFC 5545 text for the feed. Apple Calendar refreshes a subscription on its own schedule (set
// per calendar); the TTL is a hint (REFRESH-INTERVAL and X-PUBLISHED-TTL) of one hour.
export function buildCalendar(events: CalendarEvent[], baseUrl: string) {
  const calendar = ical({
    name: CALENDAR_NAME,
    description: "Grant deadlines and task due dates from Cultured Matter OS",
    prodId: { company: "Cultured Matter", product: "Cultured Matter OS", language: "EN" },
    method: ICalCalendarMethod.PUBLISH,
    ttl: 60 * 60
  });
  for (const e of events) {
    const start = calendarDay(e.date);
    calendar.createEvent({
      id: e.uid,
      allDay: true,
      start,
      // DTEND is exclusive: a one-day event ends the next day.
      end: new Date(start.getTime() + DAY),
      summary: e.title,
      description: e.description || undefined,
      url: new URL(e.href, baseUrl).toString(),
      // A deadline shouldn't block her day as busy.
      transparency: ICalEventTransparency.TRANSPARENT
    });
  }
  return calendar.toString();
}

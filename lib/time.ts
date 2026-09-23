// Day boundaries in Simone's time zone, so "today" is right on a UTC server.
export const HOME_TIME_ZONE = "America/Los_Angeles";

function partsIn(timeZone: string, date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

// Milliseconds the zone is ahead of UTC at that instant.
function offsetMs(timeZone: string, date: Date) {
  const p = partsIn(timeZone, date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

export function startOfDayIn(timeZone: string, now: Date): Date {
  const { y, m, d } = partsIn(timeZone, now);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - offsetMs(timeZone, new Date(guess)));
}

const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysUntil(date: Date, now = new Date()) {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY);
}

export function formatDeadline(deadline: Date | null, now = new Date()) {
  if (!deadline) return "Rolling";
  const days = daysUntil(deadline, now);
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

export function formatDue(due: Date, now = new Date()) {
  const days = daysUntil(due, now);
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${formatDate(due)}`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

// Sources put placeholder figures like $1 or $2 in award fields (for example a Request for
// Information that pays nothing). No real grant is that small, so those read as "no amount".
export const MIN_REAL_AMOUNT = 1_000;

export function formatAmount(rawMin: number | null, rawMax: number | null) {
  const real = (n: number | null) => (n != null && n >= MIN_REAL_AMOUNT ? n : null);
  const min = real(rawMin);
  const max = real(rawMax);
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${money.format(min)}–${money.format(max)}`;
  return `Up to ${money.format((max ?? min)!)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

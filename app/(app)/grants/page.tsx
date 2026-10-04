import { searchGrants, tasksDueBetween } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import GrantsKanban, { type View } from "./components/grants-kanban";

export async function generateMetadata() {
  return generateMeta({
    title: "Grants",
    description: "Grant opportunities you can apply for, ordered by deadline."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const DAY = 86_400_000;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = one(sp.q)?.trim() || undefined;
  const closingSoon = one(sp.soon) === "1";
  const includeNonprofit = one(sp.all) === "1";
  const showClosed = one(sp.closed) === "1";

  const requested = one(sp.view);
  const view: View =
    requested === "list" || requested === "table" || requested === "calendar" ? requested : "board";

  // Tasks for the calendar: three months back through a year ahead.
  const now = Date.now();
  const [result, due] = await Promise.all([
    searchGrants({
      query,
      forProfitOnly: !includeNonprofit,
      closingWithinDays: closingSoon ? 30 : undefined,
      hideClosed: !showClosed,
      limit: 200
    }),
    tasksDueBetween({ from: new Date(now - 90 * DAY), to: new Date(now + 366 * DAY) })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grants"
        description="Federal and California grants, soonest deadline first. Drag a grant across the board as you work on it, or see deadlines by month on the calendar."
      />
      {result.ok ? (
        <GrantsKanban
          grants={result.data.grants}
          tasks={due.ok ? due.data.tasks : []}
          filters={{ query, closingSoon, includeNonprofit, showClosed }}
          view={view}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load grants: {result.error.message}</p>
      )}
    </div>
  );
}

import { searchGrants } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { GrantsBoard } from "./grants-board";

export async function generateMetadata() {
  return generateMeta({
    title: "Grants",
    description: "Grant opportunities you can apply for, ordered by deadline."
  });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = one(sp.q)?.trim() || undefined;
  const closingSoon = one(sp.soon) === "1";
  const includeNonprofit = one(sp.all) === "1";

  const result = await searchGrants({
    query,
    forProfitOnly: !includeNonprofit,
    closingWithinDays: closingSoon ? 30 : undefined,
    limit: 200
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grants"
        description="Federal and California grants, soonest deadline first. Move a grant across the board as you work on it."
      />
      {result.ok ? (
        <GrantsBoard
          grants={result.data.grants}
          filters={{ query, closingSoon, includeNonprofit }}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load grants: {result.error.message}</p>
      )}
    </div>
  );
}

import { newsletterStatus, searchContacts } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import { PeopleView } from "./people-view";

export async function generateMetadata() {
  return generateMeta({
    title: "People",
    description: "Your network, searchable by sector and company."
  });
}

const PAGE_SIZE = 30;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = one(sp.q)?.trim() || undefined;
  const sector = one(sp.sector) || undefined;
  const newsletter = one(sp.newsletter) === "1" ? true : undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [result, status] = await Promise.all([
    searchContacts({
      query,
      sector,
      newsletter,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    newsletterStatus({})
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="Your LinkedIn network. Search by name, company or role, and tag people by sector."
      />
      {result.ok ? (
        <PeopleView
          contacts={result.data.contacts}
          total={result.data.total}
          page={page}
          pageSize={PAGE_SIZE}
          filters={{ query, sector, newsletter }}
          newsletter={status.ok ? status.data : null}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load contacts: {result.error.message}</p>
      )}
    </div>
  );
}

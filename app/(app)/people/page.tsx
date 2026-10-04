import { newsletterStatus, googleStatus, searchContacts } from "@/actions/server";
import { PageHeader } from "@/components/layout/page-shell";
import { generateMeta } from "@/lib/utils";
import type { SortDir, SortKey } from "./contacts-table";
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
  const nl = one(sp.newsletter);
  const newsletter = nl === "1" ? true : nl === "0" ? false : undefined;
  const sortParam = one(sp.sort);
  const sort: SortKey = sortParam === "company" || sortParam === "role" ? sortParam : "name";
  const dir: SortDir = one(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [result, status, google] = await Promise.all([
    searchContacts({
      query,
      sector,
      newsletter,
      sort,
      dir,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }),
    newsletterStatus({}),
    googleStatus({})
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        tourId="people-heading"
        description="Your LinkedIn and Google contacts. Search by name, company or role, and tag people by sector."
      />
      {result.ok ? (
        <PeopleView
          contacts={result.data.contacts}
          total={result.data.total}
          page={page}
          pageSize={PAGE_SIZE}
          filters={{ query, sector, newsletter }}
          sort={sort}
          dir={dir}
          newsletter={status.ok ? status.data : null}
          googleConnected={google.ok && google.data.connected}
        />
      ) : (
        <p className="text-destructive text-sm">Couldn’t load contacts: {result.error.message}</p>
      )}
    </div>
  );
}

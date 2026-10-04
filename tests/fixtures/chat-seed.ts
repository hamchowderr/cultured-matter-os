import type { Database } from "@/db";
import * as t from "@/db/schema";

// Fixed ids, so the AIMock chat fixtures (tests/fixtures/chat-aimock.json) can name them.
// People are fictional.
export const CHAT_SEED = {
  companyId: "co_soliome",
  contactId: "ct_jordan",
  grantId: "gr_epa",
  projectId: "pr_pairings"
} as const;

export async function seedChatData(db: Database, now = new Date()) {
  const day = 86_400_000;
  await db.insert(t.companies).values({
    id: CHAT_SEED.companyId,
    name: "Soliome",
    normalizedName: "soliome",
    domain: "soliome.com",
    website: "https://soliome.com",
    description: "Reef-safe sunscreen made from biomaterials.",
    stage: "Pre-seed",
    categories: ["Beauty", "Biomaterials"],
    firstSeenAt: new Date(now.getTime() - 2 * day)
  });
  await db.insert(t.contacts).values({
    id: CHAT_SEED.contactId,
    firstName: "Jordan",
    lastName: "Rivera",
    fullName: "Jordan Rivera",
    company: "Soliome",
    companyDomain: "soliome.com",
    position: "Head of Sustainability",
    sectors: ["Beauty"],
    source: "sample"
  });
  const [source] = await db
    .insert(t.sources)
    .values({
      slug: "chat-sample-grants",
      name: "Grants.gov",
      kind: "grants_gov",
      url: "https://www.grants.gov"
    })
    .returning();
  await db.insert(t.grants).values({
    id: CHAT_SEED.grantId,
    sourceId: source.id,
    raw: {},
    externalId: "EPA-SBIR-2027-1",
    title: "EPA SBIR Phase I: Sustainable Materials",
    agency: "Environmental Protection Agency",
    amountMax: 100_000,
    deadline: new Date(now.getTime() + 14 * day),
    forProfitEligible: true,
    url: "https://www.grants.gov",
    firstSeenAt: new Date(now.getTime() - 5 * day)
  });
  await db.insert(t.projects).values({ id: CHAT_SEED.projectId, name: "Brand pairings" });
}

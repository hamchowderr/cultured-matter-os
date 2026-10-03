import type { Approval, Company, Contact, Grant, Task } from "@/actions/schemas";

// Sample data for rendering cards in isolation. People are fictional.
const now = new Date("2026-09-22T12:00:00");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

export const fixtureNow = now;

export const companyFixture: Company = {
  id: "co_1",
  name: "Soliome",
  domain: "soliome.com",
  normalizedName: "soliome",
  description: "Reef-safe sunscreen.",
  website: "https://soliome.com",
  stage: "Pre-seed",
  categories: ["Beauty", "Biomaterials"],
  cohortYear: 2025,
  status: "new",
  statusNote: null,
  statusChangedAt: null,
  firstSeenAt: days(-2),
  createdAt: days(-2),
  updatedAt: days(-2)
};

export const grantFixture: Grant = {
  id: "gr_1",
  sourceId: "src_grants_gov",
  externalId: "EPA-SBIR-2027-1",
  title: "EPA SBIR Phase I: Sustainable Materials",
  agency: "Environmental Protection Agency",
  amountMin: null,
  amountMax: 100_000,
  deadline: days(14),
  forProfitEligible: true,
  url: "https://www.grants.gov",
  description: "Funding for small businesses developing technologies that reduce material waste.",
  status: "watching",
  firstSeenAt: days(-5),
  createdAt: days(-5),
  updatedAt: days(-5)
};

export const contactFixture: Contact = {
  id: "ct_1",
  firstName: "Jordan",
  lastName: "Rivera",
  fullName: "Jordan Rivera",
  email: "jordan@example.com",
  profileUrl: "https://www.linkedin.com/in/example",
  company: "Example Beauty Co",
  companyDomain: "example.com",
  position: "Head of Sustainability",
  connectedOn: "2024-03-11",
  sectors: ["Beauty", "Retail"],
  source: "sample",
  newsletter: false,
  newsletterChangedAt: null,
  newsletterSyncedAt: null,
  fluentcrmId: null,
  createdAt: days(-30),
  updatedAt: days(-30)
};

export const taskFixture: Task = {
  id: "tk_1",
  projectId: "pr_1",
  parentTaskId: null,
  captureId: null,
  title: "Ask Jordan for an intro to Soliome",
  notes: null,
  status: "waiting",
  dueDate: days(3),
  outlookConversationId: null,
  completedAt: null,
  createdAt: days(-1),
  updatedAt: days(-1)
};

export const approvalFixture: Approval = {
  id: "ap_1",
  action: "sendEmail",
  payload: { to: "jordan@example.com" },
  summary: "Send follow-up email to Jordan Rivera about Soliome",
  status: "pending",
  decidedAt: null,
  result: null,
  createdAt: days(0)
};

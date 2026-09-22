import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApprovalCard, CompanyCard, ContactCard, GrantCard, TaskCard } from "@/components/cards";
import {
  approvalFixture,
  companyFixture,
  contactFixture,
  fixtureNow,
  grantFixture,
  taskFixture
} from "@/components/cards/fixtures";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const day = 86_400_000;

describe("cards render in isolation from props", () => {
  it("company", () => {
    const out = html(
      <CompanyCard company={companyFixture} sources={["IndieBio SF"]} warmPathCount={2} />
    );
    expect(out).toContain("Soliome");
    expect(out).toContain("Beauty");
    expect(out).toContain("From IndieBio SF");
    expect(out).toContain("2 contacts can introduce you");
    expect(out).not.toContain("Shortlist");
  });

  it("company shows actions only when handlers are given", () => {
    const out = html(
      <CompanyCard company={companyFixture} onShortlist={() => {}} onPass={() => {}} />
    );
    expect(out).toContain("Shortlist");
    expect(out).toContain("Pass");
    const shortlisted = html(
      <CompanyCard company={{ ...companyFixture, status: "shortlisted" }} onShortlist={() => {}} />
    );
    expect(shortlisted).toContain("Shortlisted");
    expect(shortlisted).not.toContain(">Shortlist<");
  });

  it("grant deadline, amount and eligibility", () => {
    const out = html(<GrantCard grant={grantFixture} now={fixtureNow} />);
    expect(out).toContain("Closes in 14 days");
    expect(out).toContain("Up to $100K");
    expect(out).toContain("For-profit eligible");
    const rolling = html(
      <GrantCard grant={{ ...grantFixture, deadline: null }} now={fixtureNow} />
    );
    expect(rolling).toContain("Rolling");
    const closed = html(
      <GrantCard
        grant={{ ...grantFixture, deadline: new Date(fixtureNow.getTime() - day) }}
        now={fixtureNow}
      />
    );
    expect(closed).toContain("Closed");
  });

  it("contact", () => {
    const out = html(<ContactCard contact={contactFixture} reason="Works at a paired brand" />);
    expect(out).toContain("Jordan Rivera");
    expect(out).toContain("Head of Sustainability at Example Beauty Co");
    expect(out).toContain("Works at a paired brand");
    expect(out).toContain(">JR<");
  });

  it("task status and due date", () => {
    const out = html(<TaskCard task={taskFixture} projectName="Beauty series" now={fixtureNow} />);
    expect(out).toContain("Ask Jordan for an intro to Soliome");
    expect(out).toContain("Waiting for response");
    expect(out).toContain("Beauty series");
    const overdue = html(
      <TaskCard
        task={{ ...taskFixture, dueDate: new Date(fixtureNow.getTime() - 2 * day) }}
        now={fixtureNow}
      />
    );
    expect(overdue).toContain("Overdue by 2 days");
  });

  it("approval", () => {
    const pending = html(
      <ApprovalCard approval={approvalFixture} onApprove={() => {}} onReject={() => {}} />
    );
    expect(pending).toContain("Needs your approval");
    expect(pending).toContain("Approve");
    const done = html(
      <ApprovalCard
        approval={{ ...approvalFixture, status: "approved", decidedAt: fixtureNow }}
        onApprove={() => {}}
      />
    );
    expect(done).toContain("Approved");
    expect(done).not.toContain(">Approve<");
  });

  it("cards never fetch or call actions themselves", () => {
    for (const file of readdirSync("components/cards")) {
      const src = readFileSync(`components/cards/${file}`, "utf8");
      expect(src, file).not.toMatch(/fetch\(|@\/actions\/server|@\/actions["']|useEffect/);
    }
  });
});

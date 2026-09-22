"use client";

import { useState } from "react";

import { ApprovalCard, CompanyCard, ContactCard, GrantCard, TaskCard } from "@/components/cards";
import {
  approvalFixture,
  companyFixture,
  contactFixture,
  fixtureNow,
  grantFixture,
  taskFixture
} from "@/components/cards/fixtures";

// Local state only: shows each card's interactions without touching the database.
export function CardGallery() {
  const [company, setCompany] = useState(companyFixture);
  const [grant, setGrant] = useState(grantFixture);
  const [task, setTask] = useState(taskFixture);
  const [approval, setApproval] = useState(approvalFixture);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Radar company">
        <CompanyCard
          company={company}
          sources={["IndieBio SF"]}
          warmPathCount={2}
          onShortlist={() => setCompany({ ...company, status: "shortlisted" })}
          onPass={() => setCompany({ ...company, status: "passed" })}
        />
      </Section>
      <Section title="Grant">
        <GrantCard grant={grant} now={fixtureNow} onStatusChange={(status) => setGrant({ ...grant, status })} />
      </Section>
      <Section title="Contact">
        <ContactCard contact={contactFixture} reason="Works at a brand paired with Soliome" />
      </Section>
      <Section title="Task">
        <TaskCard
          task={task}
          projectName="Beauty series"
          now={fixtureNow}
          onStatusChange={(status) => setTask({ ...task, status })}
        />
      </Section>
      <Section title="Approval">
        <ApprovalCard
          approval={approval}
          onApprove={() => setApproval({ ...approval, status: "approved", decidedAt: new Date() })}
          onReject={() => setApproval({ ...approval, status: "rejected", decidedAt: new Date() })}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

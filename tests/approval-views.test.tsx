import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { approvalView } from "@/components/chat/approval-view";
import { approvalViews, pageName } from "@/components/chat/approval-views";
import { describeAgentActions } from "@/lib/agent-actions";
import type { PendingApproval } from "@/lib/agent-controller/events";

// What the assistant's approval cards say (components/chat/approval-views.tsx): plain
// sentences, and before → after from the agent server's preview.

const card = (toolName: string, args: unknown, preview?: unknown) => {
  const approval: PendingApproval = {
    toolCallId: "c1",
    toolName,
    args,
    category: null,
    ...(preview !== undefined ? { preview } : {})
  };
  const view = approvalView(approval, approvalViews);
  return {
    title: renderToStaticMarkup(<>{view.title}</>),
    body: renderToStaticMarkup(<>{view.body}</>)
  };
};

describe("page approval cards", () => {
  it("names the page, says whether it is live, and shows each block before and after", () => {
    const { title, body } = card(
      "cultured-matter-update-page",
      {
        id: 41,
        page: "/series",
        live: true,
        changes: [
          {
            path: "0.0.0",
            before: { text: "We're a <em>creative</em> agency." },
            after: { text: "We're a <em>creative</em> studio." }
          }
        ]
      },
      {
        path: "/series",
        status: "publish",
        title: null,
        changes: [
          {
            path: "0.0.0",
            before: { text: "We’re a <em>creative</em> agency." },
            after: { text: "We’re a <em>creative</em> studio." }
          }
        ]
      }
    );
    expect(title).toBe("Update the Series page");
    expect(body).toContain("Live: changes show on the site at once");
    expect(body).toContain("We’re a creative agency.");
    expect(body).toContain("We’re a creative studio.");
    expect(body).not.toContain("&lt;em&gt;");
  });

  it("a draft says it is not on the site; the home page is the home page", () => {
    expect(pageName("/")).toBe("home");
    expect(pageName("/agent-test-draft")).toBe("Agent test draft");
    const { title, body } = card(
      "cultured-matter-update-page",
      { id: 66, page: "/agent-test-draft", live: false, changes: [] },
      { path: "/agent-test-draft", status: "draft", changes: [] }
    );
    expect(title).toBe("Update the Agent test draft page");
    expect(body).toContain("Draft: not on the site yet");
    expect(card("cultured-matter-create-page", { title: "Events" }).title).toBe(
      "Create a draft page “Events”"
    );
  });
});

describe("Fluent approval cards", () => {
  it("upsert-contact: adding someone new, or their fields before → after", () => {
    const fresh = card(
      "fluent-crm-upsert-contact",
      {
        email: "grace@hopper.example",
        first_name: "Grace",
        last_name: "Hopper",
        add_tags: ["Investors"]
      },
      { exists: false }
    );
    expect(fresh.title).toBe("Add Grace Hopper to your contacts");
    expect(fresh.body).toContain("Investors");

    const known = card(
      "fluent-crm-upsert-contact",
      { email: "ada@lovelace.example", first_name: "Augusta" },
      { exists: true, contact: { first_name: "Ada", last_name: "Lovelace" } }
    );
    expect(known.title).toBe("Update Augusta in your contacts");
    expect(known.body).toContain("Ada");
    expect(known.body).toContain("Augusta");
  });

  it("a form notification shows the plugin's dry run: old and new recipient, and its warning", () => {
    const { title, body } = card(
      "fluentform-upsert-email-notification",
      { form_id: 1, notification_id: 3, send_to_email: "new@x.example" },
      {
        form_id: 1,
        action: "update",
        recipient: { from: "old@x.example", to: "new@x.example" },
        subject: { from: "New entry", to: "New entry" },
        warning: "This redirects every future submission."
      }
    );
    expect(title).toBe("Change a form’s email notification");
    expect(body).toContain("old@x.example");
    expect(body).toContain("new@x.example");
    expect(body).toContain("This redirects every future submission.");
  });

  it("form fields: the fields added and removed", () => {
    const { body } = card(
      "fluentform-update-form-fields",
      { form_id: 1, fields: [] },
      { removed_field_keys: ["phone"], new_field_keys: ["company"], kept_field_keys: ["email"] }
    );
    expect(body).toContain("Fields added");
    expect(body).toContain("company");
    expect(body).toContain("Fields removed");
    expect(body).toContain("phone");
  });

  it("a campaign draft says nothing is sent", () => {
    const { title, body } = card("fluent-crm-upsert-campaign", {
      title: "October news",
      email_subject: "Hello"
    });
    expect(title).toBe("Save a campaign draft “October news”");
    expect(body).toContain("nothing is sent or scheduled");
  });
});

describe("the app's own writes", () => {
  it("every write the assistant can run has a plain card", () => {
    const writes = describeAgentActions()
      .filter((a) => a.kind === "write")
      .map((a) => a.name);
    expect(writes.filter((name) => !approvalViews[name])).toEqual([]);
  });

  it("reads as a sentence", () => {
    expect(card("createTask", { title: "Call the lab", dueDate: "2026-10-09" }).title).toBe(
      "Add the task “Call the lab”, due 2026-10-09"
    );
    expect(card("setTaskStatus", { taskId: "t1", status: "waiting" }).title).toBe(
      "Mark a task as waiting for a response"
    );
    expect(card("draftGrantApplication", { grantId: "g1" }).title).toBe(
      "Draft the application for this grant"
    );
  });
});

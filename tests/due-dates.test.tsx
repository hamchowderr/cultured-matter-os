// Vercel runs in UTC. A due date is a calendar day: "Friday" must stay Friday for Simone
// (America/Los_Angeles) however the server's clock is set.
process.env.TZ = "UTC";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as A from "@/actions";
import { TaskCard } from "@/components/cards";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { isoDayIn } from "@/lib/activity";
import { describeAgentActions, handleRunAgentAction } from "@/lib/agent-actions";
import { fromDateInput } from "@/app/(app)/projects/types";
import { freshDb } from "./test-db";

vi.mock("@/lib/auth", () => ({ auth: {} }));

let db: Database;
let cleanup: () => void;
const KEY = "test-agent-service-token-0123456789";
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  process.env.AGENT_SERVICE_TOKEN = KEY;
});
afterAll(() => {
  delete process.env.AGENT_SERVICE_TOKEN;
  cleanup();
});

// The assistant's createTask / updateTask, as the agent server calls them.
async function agent(name: string, input: unknown) {
  const res = await handleRunAgentAction(
    new Request(`http://localhost/api/agent/actions/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(input)
    }),
    name,
    { db }
  );
  return { status: res.status, body: await res.json() };
}

const stored = async (id: string) =>
  (await db.select().from(t.tasks).where(eq(t.tasks.id, id)))[0]!.dueDate;
const weekdayInLA = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });

describe("due dates on a UTC server", () => {
  it("runs in UTC", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
    expect(new Date("2026-10-09T00:00:00").toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it('"2026-10-09" from the assistant stays Friday 9 Oct for Simone', async () => {
    const { status, body } = await agent("createTask", {
      title: "Call the lab",
      dueDate: "2026-10-09"
    });
    expect(status).toBe(200);
    const due = (await stored(body.data.id))!;
    expect(isoDayIn(due, "America/Los_Angeles")).toBe("2026-10-09");
    expect(weekdayInLA(due)).toBe("Friday");
    // Noon in her zone: the same calendar day in UTC too, so server-rendered labels agree.
    expect(due.toISOString()).toBe("2026-10-09T19:00:00.000Z");
  });

  it("a zone-less date-time keeps its own day (no shift through the server's zone)", async () => {
    const { body } = await agent("createTask", {
      title: "Midnight-style",
      dueDate: "2026-10-09T00:00:00"
    });
    expect(isoDayIn((await stored(body.data.id))!, "America/Los_Angeles")).toBe("2026-10-09");
  });

  it("updateTask moves it to another calendar day, and null clears it", async () => {
    const { body } = await agent("createTask", { title: "Move me", dueDate: "2026-10-09" });
    await agent("updateTask", { taskId: body.data.id, dueDate: "2026-10-16" });
    expect(isoDayIn((await stored(body.data.id))!, "America/Los_Angeles")).toBe("2026-10-16");
    await agent("updateTask", { taskId: body.data.id, dueDate: null });
    expect(await stored(body.data.id)).toBeNull();
  });

  it("refuses something that is not a calendar date", async () => {
    const { status } = await agent("createTask", { title: "Bad", dueDate: "next Friday" });
    expect(status).toBe(400);
  });

  it("the date picker sends the day itself, so its zone doesn't matter either", async () => {
    expect(fromDateInput("2026-10-09")).toBe("2026-10-09");
    expect(fromDateInput("")).toBeNull();
    const task = await A.createTask.run(
      { title: "From the picker", dueDate: fromDateInput("2026-10-09") ?? undefined },
      { db }
    );
    expect(isoDayIn(task.dueDate!, "America/Los_Angeles")).toBe("2026-10-09");
  });

  it("the assistant is offered a calendar date", () => {
    const createTask = describeAgentActions().find((a) => a.name === "createTask") as {
      inputSchema: { properties: Record<string, unknown> };
    };
    expect(createTask.inputSchema.properties.dueDate).toEqual({
      type: "string",
      format: "date",
      description: "A calendar date, YYYY-MM-DD."
    });
  });

  it("the UI shows Friday's date", async () => {
    const { body } = await agent("createTask", { title: "Show me", dueDate: "2026-10-09" });
    const [task] = await db.select().from(t.tasks).where(eq(t.tasks.id, body.data.id));
    // Tuesday morning in Los Angeles, three days before.
    const now = new Date("2026-10-06T16:00:00Z");
    const html = renderToStaticMarkup(<TaskCard task={task!} now={now} />);
    expect(html).toContain("Due Oct 9, 2026");
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });
beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

describe("inbox", () => {
  it("lists unfiled items newest first and counts them", async () => {
    await A.createCapture.run({ body: "First thought" }, ctx());
    await new Promise((r) => setTimeout(r, 5));
    await A.createCapture.run({ body: "Second thought" }, ctx());
    const inbox = await A.listCaptures.run({}, ctx());
    expect(inbox.captures.map((c) => c.body)).toEqual(["Second thought", "First thought"]);
    expect(inbox.unfiled).toBe(2);
  });

  it("requires a project when filing a task", async () => {
    const c = await A.createCapture.run({ body: "Email Kwaku" }, ctx());
    await expect(
      A.classifyCapture.run({ captureId: c.id, kind: "task", tier: 1 }, ctx())
    ).rejects.toThrow(/Choose a project/);
  });

  it("files into Projects once, even when re-filed", async () => {
    const project = await A.createProject.run({ name: "Beauty series" }, ctx());
    const c = await A.createCapture.run({ body: "Ask Jordan for an intro" }, ctx());
    const first = await A.classifyCapture.run(
      { captureId: c.id, kind: "task", tier: 1, projectId: project.id },
      ctx()
    );
    const again = await A.classifyCapture.run(
      { captureId: c.id, kind: "task", tier: 2, projectId: project.id },
      ctx()
    );
    expect(again.task?.id).toBe(first.task?.id);
    const made = await db.select().from(t.tasks).where(eq(t.tasks.captureId, c.id));
    expect(made).toHaveLength(1);

    const detail = await A.getProject.run({ projectId: project.id }, ctx());
    expect(detail.tasks.map((x) => x.title)).toEqual(["Ask Jordan for an intro"]);
  });

  it("shows filed items by kind, tier and project, with the project name", async () => {
    const c = await A.createCapture.run({ body: "Mycelium packaging episode" }, ctx());
    await A.classifyCapture.run({ captureId: c.id, kind: "idea", tier: 2 }, ctx());

    const ideas = await A.listCaptures.run({ filed: true, kind: "idea" }, ctx());
    expect(ideas.captures.map((x) => x.body)).toEqual(["Mycelium packaging episode"]);
    const tasks = await A.listCaptures.run({ filed: true, kind: "task" }, ctx());
    expect(tasks.captures[0]).toMatchObject({ projectName: "Beauty series", tier: 2 });
    const tier1 = await A.listCaptures.run({ filed: true, tier: 1 }, ctx());
    expect(tier1.captures).toHaveLength(0);
  });
});

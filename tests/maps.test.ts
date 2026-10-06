import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as A from "@/actions";
import { ActionError } from "@/actions";
import type { Database } from "@/db";
import * as t from "@/db/schema";
import {
  ALL_LAYERS,
  buildBusinessMap,
  CAPS,
  mapRecords,
  ROOT_ID,
  type BusinessMap,
  visibleNodes
} from "@/lib/business-map";
import { layoutGraph, layoutTwoSided } from "@/lib/map-layout";
import { findLinkableRecords } from "@/actions/maps";
import {
  MAX_EDGES,
  MAX_NODES,
  mindMapGraphSchema,
  reconcileIncoming,
  recordHref
} from "@/lib/mind-map";
import { freshDb } from "./test-db";

let db: Database;
let cleanup: () => void;
const ctx = () => ({ db });

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
});
afterAll(() => cleanup());

const DAY = 86_400_000;
const node = (map: BusinessMap, id: string) => map.nodes.find((n) => n.id === id);
const childrenOf = (map: BusinessMap, id: string) =>
  map.edges.filter((e) => e.source === id && e.kind === "tree").map((e) => e.target);

// Radar companies, contacts and grants arrive by ingest and import, so they are inserted as rows
// (as the other suites do); everything Simone does by hand goes through the real actions.
async function seedCompany(name: string, domain?: string) {
  const [row] = await db
    .insert(t.companies)
    .values({ name, domain, normalizedName: name.toLowerCase(), firstSeenAt: new Date() })
    .returning();
  return row;
}

async function seedGrantSource() {
  const [src] = await db
    .insert(t.sources)
    .values({ slug: "grants-gov", name: "Grants.gov", kind: "grants_gov", url: "https://x" })
    .returning();
  return src;
}

async function seedGrant(sourceId: string, title: string, deadline: Date | null) {
  const [row] = await db
    .insert(t.grants)
    .values({
      sourceId,
      externalId: title,
      title,
      agency: "NSF",
      deadline,
      raw: {},
      firstSeenAt: new Date(),
      forProfitEligible: true
    })
    .returning();
  return row;
}

async function fileIdea(body: string, projectId?: string) {
  const capture = await A.createCapture.run({ body }, ctx());
  await A.classifyCapture.run({ captureId: capture.id, kind: "idea", tier: 2, projectId }, ctx());
  return capture;
}

describe("getBusinessMap", () => {
  it("is just the business when there is no data yet", async () => {
    const map = await A.getBusinessMap.run({}, ctx());
    expect(map.rootId).toBe(ROOT_ID);
    expect(map.nodes).toHaveLength(1);
    expect(map.nodes[0]).toMatchObject({ kind: "business", label: "Cultured Matter" });
    expect(map.edges).toEqual([]);
  });

  it("maps business > projects > open tasks, with ideas, Radar and grants", async () => {
    await A.updateBusinessProfile.run({ name: "Cultured Matter Co" }, ctx());
    const reef = await A.createProject.run({ name: "Reef-safe sunscreen" }, ctx());
    const docu = await A.createProject.run({ name: "Docuseries" }, ctx());
    const paused = await A.createProject.run({ name: "Pop-up" }, ctx());
    await A.updateProject.run({ projectId: paused.id, status: "paused" }, ctx());
    const finished = await A.createProject.run({ name: "Old launch" }, ctx());
    await A.updateProject.run({ projectId: finished.id, status: "done" }, ctx());
    const home = await A.createProject.run({ name: "Home & meals", business: "Personal" }, ctx());

    const low = await A.createTask.run(
      { title: "Order samples", projectId: reef.id, priority: "low" },
      ctx()
    );
    const urgent = await A.createTask.run(
      {
        title: "Call the lab",
        projectId: reef.id,
        priority: "urgent",
        dueDate: new Date(Date.now() + DAY)
      },
      ctx()
    );
    const done = await A.createTask.run({ title: "Pick a name", projectId: reef.id }, ctx());
    await A.setTaskStatus.run({ taskId: done.id, status: "done" }, ctx());
    await A.createTask.run({ title: "Sub step", projectId: reef.id, parentTaskId: low.id }, ctx());
    await A.createTask.run({ title: "Groceries", projectId: home.id }, ctx());
    const loose = await A.createTask.run({ title: "Renew the domain" }, ctx());
    // A task in Docuseries that also belongs to the sunscreen project.
    const shared = await A.createTask.run({ title: "Film the lab", projectId: docu.id }, ctx());
    await A.linkTaskToProject.run({ taskId: shared.id, projectId: reef.id }, ctx());

    const projectIdea = await fileIdea("Mineral tint for darker skin", reef.id);
    const looseIdea = await fileIdea("A podcast about fermentation");
    await fileIdea("Meal plan app", home.id);

    const shortlisted = await seedCompany("Mycofab", "mycofab.com");
    await A.shortlistCompany.run({ companyId: shortlisted.id }, ctx());
    const starred = await seedCompany("Kelp Labs");
    await A.starCompany.run({ companyId: starred.id }, ctx());
    await seedCompany("Ignored Inc");
    const [ana] = await db
      .insert(t.contacts)
      .values({
        fullName: "Ana Ruiz",
        companyDomain: "mycofab.com",
        position: "CTO",
        source: "sample"
      })
      .returning();
    const [bo] = await db
      .insert(t.contacts)
      .values({ fullName: "Bo Lee", company: "Elsewhere", source: "sample" })
      .returning();
    await A.linkContact.run({ contactId: bo.id, companyId: starred.id }, ctx());

    const src = await seedGrantSource();
    const applying = await seedGrant(src.id, "SBIR Phase I", new Date(Date.now() + 30 * DAY));
    await A.setGrantStatus.run({ grantId: applying.id, status: "applying" }, ctx());
    const passed = await seedGrant(src.id, "Not for us", null);
    await A.setGrantStatus.run({ grantId: passed.id, status: "passed" }, ctx());
    await seedGrant(src.id, "Never looked at", null);

    const map = await A.getBusinessMap.run({}, ctx());
    const labels = map.nodes.map((n) => n.label);

    expect(node(map, ROOT_ID)?.label).toBe("Cultured Matter Co");
    // Open business projects only.
    expect(
      childrenOf(map, ROOT_ID)
        .filter((id) => id.startsWith("project:"))
        .sort()
    ).toEqual([`project:${reef.id}`, `project:${docu.id}`, `project:${paused.id}`].sort());
    expect(labels).not.toContain("Old launch");
    expect(labels).not.toContain("Home & meals");
    expect(labels).not.toContain("Groceries");
    expect(labels).not.toContain("Meal plan app");

    // Open top-level tasks, most pressing first; done tasks and subtasks left out.
    const reefKids = childrenOf(map, `project:${reef.id}`);
    expect(reefKids.filter((id) => id.startsWith("task:"))).toEqual([
      `task:${urgent.id}`,
      `task:${low.id}`
    ]);
    expect(labels).not.toContain("Pick a name");
    expect(labels).not.toContain("Sub step");
    expect(node(map, `task:${urgent.id}`)).toMatchObject({
      priority: "urgent",
      record: { type: "task", id: urgent.id },
      href: `/projects?p=${reef.id}&task=${urgent.id}`
    });
    // The linked-in task hangs off its home project, with a dashed link to the other one.
    expect(childrenOf(map, `project:${docu.id}`)).toContain(`task:${shared.id}`);
    expect(map.edges).toContainEqual(
      expect.objectContaining({
        source: `project:${reef.id}`,
        target: `task:${shared.id}`,
        kind: "cross"
      })
    );
    // A task with no project still shows, under its own hub.
    expect(childrenOf(map, "hub:loose")).toEqual([`task:${loose.id}`]);

    // Ideas: under their project when it is on the map, otherwise under Ideas.
    expect(reefKids).toContain(`idea:${projectIdea.id}`);
    expect(childrenOf(map, "hub:ideas")).toEqual([`idea:${looseIdea.id}`]);
    expect(node(map, `idea:${looseIdea.id}`)?.side).toBe("left");

    // Radar: shortlisted first, then starred, each with the people who can reach it.
    expect(childrenOf(map, "hub:radar")).toEqual([
      `company:${shortlisted.id}`,
      `company:${starred.id}`
    ]);
    expect(labels).not.toContain("Ignored Inc");
    expect(childrenOf(map, `company:${shortlisted.id}`)).toEqual([
      `contact:${ana.id}@${shortlisted.id}`
    ]);
    expect(node(map, `contact:${ana.id}@${shortlisted.id}`)).toMatchObject({
      kind: "person",
      detail: "CTO",
      record: { type: "contact", id: ana.id },
      href: "/people?q=Ana%20Ruiz"
    });
    expect(childrenOf(map, `company:${starred.id}`)).toEqual([`contact:${bo.id}@${starred.id}`]);

    // Grants still in play.
    expect(childrenOf(map, "hub:grants")).toEqual([`grant:${applying.id}`]);
    expect(node(map, `grant:${applying.id}`)).toMatchObject({ status: "applying", detail: "NSF" });

    expect(map.counts).toEqual({
      projects: 3,
      tasks: 4,
      ideas: 2,
      companies: 2,
      people: 2,
      grants: 1
    });
    // Every edge joins two nodes on the map.
    const ids = new Set(map.nodes.map((n) => n.id));
    for (const e of map.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
  });

  it("follows the data: a task marked done leaves the map", async () => {
    const before = await A.getBusinessMap.run({}, ctx());
    const task = before.nodes.find((n) => n.kind === "task" && n.label === "Call the lab")!;
    await A.setTaskStatus.run({ taskId: task.record!.id, status: "done" }, ctx());
    const after = await A.getBusinessMap.run({}, ctx());
    expect(after.nodes.find((n) => n.id === task.id)).toBeUndefined();
    expect(after.counts.tasks).toBe(before.counts.tasks - 1);
  });
});

describe("buildBusinessMap", () => {
  const empty = {
    businessName: "Cultured Matter",
    projects: [],
    tasks: [],
    ideas: [],
    companies: [],
    people: [],
    grants: []
  };

  it("folds long lists into a +N more node that opens the page", () => {
    const tasks = Array.from({ length: CAPS.tasksPerProject + 3 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      status: "todo",
      priority: "medium" as const,
      dueDate: null,
      projectId: "p1",
      alsoIn: []
    }));
    const map = buildBusinessMap({
      ...empty,
      projects: [{ id: "p1", name: "Big", status: "active", description: null }],
      tasks
    });
    const kids = childrenOf(map, "project:p1");
    expect(kids.filter((k) => k.startsWith("task:"))).toHaveLength(CAPS.tasksPerProject);
    expect(node(map, "more:project:p1")).toMatchObject({
      kind: "more",
      label: "+3 more",
      href: "/projects?p=p1"
    });
    expect(map.counts.tasks).toBe(CAPS.tasksPerProject + 3);
  });

  it("lists a person once per company even with two warm paths", () => {
    const person = { contactId: "c1", fullName: "Ana", position: null, company: null };
    const map = buildBusinessMap({
      ...empty,
      companies: [{ id: "k1", name: "Kelp", status: "starred", stage: "Seed" }],
      people: [
        { companyId: "k1", ...person },
        { companyId: "k1", ...person }
      ]
    });
    expect(childrenOf(map, "company:k1")).toEqual(["contact:c1@k1"]);
    expect(node(map, "company:k1")?.detail).toBe("Seed");
  });
});

describe("map layers", () => {
  it("drops a switched-off layer with its group, children and +N more", async () => {
    const map = await A.getBusinessMap.run({}, ctx());
    const all = visibleNodes(map, ALL_LAYERS);
    expect(all).toHaveLength(map.nodes.length);

    const noRadar = visibleNodes(
      map,
      ALL_LAYERS.filter((l) => l !== "companies")
    );
    const kinds = new Set(noRadar.map((n) => n.kind));
    expect(kinds.has("company")).toBe(false);
    // People hang off companies, so they go too; the Radar group goes with its only layer.
    expect(kinds.has("person")).toBe(false);
    expect(noRadar.find((n) => n.id === "hub:radar")).toBeUndefined();
    expect(kinds.has("project")).toBe(true);

    const noTasks = visibleNodes(
      map,
      ALL_LAYERS.filter((l) => l !== "tasks")
    );
    expect(noTasks.some((n) => n.kind === "task")).toBe(false);
    expect(noTasks.find((n) => n.id === "hub:loose")).toBeUndefined();
    // Ideas filed under a project stay with it.
    expect(noTasks.some((n) => n.kind === "idea")).toBe(true);
  });

  it("lists each linkable record once", async () => {
    const map = await A.getBusinessMap.run({}, ctx());
    const records = mapRecords(map);
    const keys = records.map((r) => `${r.type}:${r.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(records.some((r) => r.type === "contact")).toBe(true);
    expect(records.every((r) => r.title.length > 0)).toBe(true);
  });
});

describe("layout", () => {
  it("puts the root at the centre with each side growing outwards", () => {
    const nodes = [
      { id: "r", width: 200, height: 50 },
      { id: "a", width: 200, height: 50, side: "right" as const },
      { id: "b", width: 200, height: 50, side: "left" as const },
      { id: "a1", width: 200, height: 50, side: "right" as const }
    ];
    const pos = layoutTwoSided("r", nodes, [
      { source: "r", target: "a" },
      { source: "r", target: "b" },
      { source: "a", target: "a1" }
    ]);
    expect(pos.get("r")).toEqual({ x: -100, y: -25 });
    expect(pos.get("a")!.x).toBeGreaterThan(0);
    expect(pos.get("a1")!.x).toBeGreaterThan(pos.get("a")!.x);
    expect(pos.get("b")!.x).toBeLessThan(-200);
  });

  it("lays out the real business map with no two nodes overlapping", async () => {
    const map = await A.getBusinessMap.run({}, ctx());
    const sized = map.nodes.map((n) => ({ id: n.id, width: 220, height: 64, side: n.side }));
    const pos = layoutTwoSided(
      map.rootId,
      sized,
      map.edges.filter((e) => e.kind === "tree")
    );
    expect(pos.size).toBe(map.nodes.length);
    const boxes = [...pos.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 64;
        expect(overlap).toBe(false);
      }
    }
  });

  it("tidies any graph, cycles included", () => {
    const pos = layoutGraph(
      ["a", "b", "c"].map((id) => ({ id, width: 100, height: 40 })),
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "a" }
      ]
    );
    expect(pos.size).toBe(3);
  });
});

describe("graph validation", () => {
  const n = (id: string) => ({ id, label: id, x: 0, y: 0 });

  it("accepts a well-formed graph", () => {
    expect(
      mindMapGraphSchema.safeParse({
        nodes: [n("a"), n("b")],
        edges: [{ id: "e", source: "a", target: "b" }]
      }).success
    ).toBe(true);
  });

  it.each([
    ["duplicate node ids", [n("a"), n("a")], []],
    ["an edge to a missing node", [n("a")], [{ id: "e", source: "a", target: "z" }]],
    ["a self link", [n("a")], [{ id: "e", source: "a", target: "a" }]],
    [
      "the same pair twice",
      [n("a"), n("b")],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" }
      ]
    ],
    ["a blank label", [{ ...n("a"), label: "  " }], []],
    ["a position far off the canvas", [{ ...n("a"), x: 1e9 }], []],
    ["a link to an unknown record type", [{ ...n("a"), link: { type: "invoice", id: "1" } }], []]
  ])("rejects %s", (_name, nodes, edges) => {
    expect(mindMapGraphSchema.safeParse({ nodes, edges }).success).toBe(false);
  });

  it("caps nodes and edges", () => {
    const many = Array.from({ length: MAX_NODES + 1 }, (_, i) => n(`n${i}`));
    expect(mindMapGraphSchema.safeParse({ nodes: many, edges: [] }).success).toBe(false);
    const nodes = many.slice(0, 40);
    const edges = [];
    for (let i = 0; i < 40 && edges.length <= MAX_EDGES; i++)
      for (let j = i + 1; j < 40 && edges.length <= MAX_EDGES; j++)
        edges.push({ id: `e${i}-${j}`, source: `n${i}`, target: `n${j}` });
    expect(mindMapGraphSchema.safeParse({ nodes, edges }).success).toBe(false);
  });

  it("builds record links the pages understand", () => {
    expect(recordHref({ type: "project", id: "p" })).toBe("/projects?p=p");
    expect(recordHref({ type: "grant", id: "g" }, { title: "SBIR & co" })).toBe(
      "/grants?all=1&closed=1&q=SBIR%20%26%20co"
    );
    expect(recordHref({ type: "company", id: "k" }, { title: "Kelp" })).toBe(
      "/radar?view=all&q=Kelp&company=k"
    );
  });
});

describe("a map changed while the editor is open", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("refuses the editor's save over a newer version, and accepts it on the version it loaded", async () => {
    // The editor opens the map: it holds this version and its updatedAt.
    const opened = await A.createMindMap.run({ title: "Sponsors" }, ctx());
    await sleep(5);
    // The assistant's approved updateMindMap (no expectedUpdatedAt) adds a node.
    const byAssistant = await A.updateMindMap.run(
      {
        mindMapId: opened.id,
        nodes: [...opened.nodes, { id: "ai", label: "Patagonia", x: 250, y: 0 }],
        edges: [{ id: "e-ai", source: "root", target: "ai" }]
      },
      ctx()
    );
    expect(byAssistant.updatedAt.getTime()).toBeGreaterThan(opened.updatedAt.getTime());

    // The editor saves what it had, against the version it loaded: refused, nothing lost.
    const blind = A.updateMindMap.run(
      {
        mindMapId: opened.id,
        nodes: [{ ...opened.nodes[0], label: "Sponsors (mine)" }],
        edges: [],
        expectedUpdatedAt: opened.updatedAt
      },
      ctx()
    );
    await expect(blind).rejects.toMatchObject({ code: "conflict" });
    const kept = await A.getMindMap.run({ mindMapId: opened.id }, ctx());
    expect(kept.map.nodes.map((n) => n.label)).toEqual(["Sponsors", "Patagonia"]);

    // After reloading, it saves on top of the newer version.
    const saved = await A.updateMindMap.run(
      {
        mindMapId: opened.id,
        title: "Sponsors v2",
        expectedUpdatedAt: kept.map.updatedAt
      },
      ctx()
    );
    expect(saved.title).toBe("Sponsors v2");
    expect(saved.nodes).toHaveLength(2);
  });

  it("moves updatedAt forward even for two saves in the same millisecond", async () => {
    const m = await A.createMindMap.run({ title: "Fast" }, ctx());
    const a = await A.updateMindMap.run({ mindMapId: m.id, title: "Fast 1" }, ctx());
    const b = await A.updateMindMap.run({ mindMapId: m.id, title: "Fast 2" }, ctx());
    expect(a.updatedAt.getTime()).toBeGreaterThan(m.updatedAt.getTime());
    expect(b.updatedAt.getTime()).toBeGreaterThan(a.updatedAt.getTime());
  });

  it("decides what the open editor does with a newer version", () => {
    const base = {
      title: "Map",
      nodes: [{ id: "root", label: "Map", x: 0, y: 0, link: null }],
      edges: []
    };
    const newer = {
      ...base,
      nodes: [...base.nodes, { id: "ai", label: "From the assistant", x: 250, y: 0 }]
    };
    // Its own save coming back (positions rounded, link left out): nothing to do.
    const own = { ...base, nodes: [{ id: "root", label: "Map", x: 0.4, y: -0.2 }] };
    expect(reconcileIncoming(own, base, true)).toBe("same");
    // Someone else's change, nothing unsaved here: show it.
    expect(reconcileIncoming(newer, base, false)).toBe("adopt");
    // Someone else's change while she has unsaved edits: warn, don't save over it.
    expect(reconcileIncoming(newer, base, true)).toBe("conflict");
  });
});

describe("findLinkableRecords", () => {
  it("finds any record by name, not only what the business map shows", async () => {
    const project = await A.createProject.run({ name: "Seaweed packaging trial" }, ctx());
    const done = await A.createTask.run(
      { title: "Seaweed supplier call", projectId: project.id },
      ctx()
    );
    // Done tasks never appear on the business map, but can still be linked.
    await A.setTaskStatus.run({ taskId: done.id, status: "done" }, ctx());
    const unstarred = await seedCompany("Seaweed Labs");
    const found = await findLinkableRecords("seaweed", ctx());
    expect(found.map((r) => `${r.type}:${r.title}`).sort()).toEqual(
      [
        "company:Seaweed Labs",
        "project:Seaweed packaging trial",
        "task:Seaweed supplier call"
      ].sort()
    );
    expect(found.find((r) => r.id === unstarred.id)?.href).toContain(`company=${unstarred.id}`);
    expect(await findLinkableRecords("   ", ctx())).toEqual([]);
  });
});

describe("saved mind maps", () => {
  it("creates a map that starts with its title in the middle, and logs it", async () => {
    const map = await A.createMindMap.run({ title: "Sponsor ideas" }, ctx());
    expect(map.nodes).toEqual([{ id: "root", label: "Sponsor ideas", x: 0, y: 0, link: null }]);
    expect(map.edges).toEqual([]);
    const log = await db.select().from(t.activityLog).where(eq(t.activityLog.entityId, map.id));
    expect(log.map((l) => l.action)).toEqual(["createMindMap"]);
    expect(log[0].summary).toBe('Created mind map "Sponsor ideas"');
  });

  it("saves nodes linked to real records, and reports what they point at", async () => {
    const project = await A.createProject.run({ name: "Sunscreen launch" }, ctx());
    const company = await seedCompany("Soliome");
    const created = await A.createMindMap.run(
      {
        title: "Launch plan",
        nodes: [
          { id: "root", label: "Launch", x: 0, y: 0 },
          {
            id: "p",
            label: "The project",
            x: 250,
            y: 0,
            link: { type: "project", id: project.id }
          },
          { id: "k", label: "Partner", x: -250, y: 0, link: { type: "company", id: company.id } }
        ],
        edges: [
          { id: "e1", source: "root", target: "p" },
          { id: "e2", source: "root", target: "k" }
        ]
      },
      ctx()
    );

    // Rename a node, add one and link it, as the editor does: the whole graph is sent back.
    const nodes = [
      ...created.nodes.map((nd) => (nd.id === "root" ? { ...nd, label: "Launch v2" } : nd)),
      { id: "n4", label: "Press kit", x: 250, y: 120, link: null }
    ];
    const edges = [...created.edges, { id: "e3", source: "p", target: "n4" }];
    await A.updateMindMap.run(
      { mindMapId: created.id, title: "Launch plan v2", nodes, edges },
      ctx()
    );

    const { map, records } = await A.getMindMap.run({ mindMapId: created.id }, ctx());
    expect(map.title).toBe("Launch plan v2");
    expect(map.nodes.map((nd) => nd.label)).toEqual([
      "Launch v2",
      "The project",
      "Partner",
      "Press kit"
    ]);
    expect(map.edges).toHaveLength(3);
    expect(records).toEqual([
      {
        type: "project",
        id: project.id,
        title: "Sunscreen launch",
        href: `/projects?p=${project.id}`,
        missing: false
      },
      {
        type: "company",
        id: company.id,
        title: "Soliome",
        href: `/radar?view=all&q=Soliome&company=${company.id}`,
        missing: false
      }
    ]);

    // The record goes away: the map still loads and still saves.
    await A.deleteProject.run({ projectId: project.id }, ctx());
    const after = await A.getMindMap.run({ mindMapId: created.id }, ctx());
    expect(after.records[0]).toMatchObject({ type: "project", missing: true, title: null });
    await A.updateMindMap.run(
      { mindMapId: created.id, nodes: after.map.nodes, edges: after.map.edges },
      ctx()
    );
  });

  it("refuses a link to a record that doesn't exist", async () => {
    await expect(
      A.createMindMap.run(
        {
          title: "Bad",
          nodes: [{ id: "a", label: "A", x: 0, y: 0, link: { type: "task", id: "nope" } }]
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "invalid", message: "No task with id nope to link to" });
    expect((await A.listMindMaps.run({}, ctx())).maps.map((m) => m.title)).not.toContain("Bad");
  });

  it("refuses nodes without edges, and a broken graph, before running", async () => {
    const { id } = await A.createMindMap.run({ title: "Half" }, ctx());
    await expect(
      A.updateMindMap.run({ mindMapId: id, nodes: [{ id: "a", label: "A", x: 0, y: 0 }] }, ctx())
    ).rejects.toThrow("Send nodes and edges together");
    await expect(
      A.updateMindMap.run(
        { mindMapId: id, nodes: [], edges: [{ id: "e", source: "a", target: "b" }] },
        ctx()
      )
    ).rejects.toThrow("points at a node that isn't on the map");
  });

  it("lists maps newest change first with their sizes, and deletes one", async () => {
    const a = await A.createMindMap.run({ title: "Alpha" }, ctx());
    const b = await A.createMindMap.run({ title: "Beta" }, ctx());
    await A.updateMindMap.run({ mindMapId: a.id, title: "Alpha renamed" }, ctx());
    const { maps } = await A.listMindMaps.run({}, ctx());
    expect(maps[0]).toMatchObject({ id: a.id, title: "Alpha renamed", nodeCount: 1, edgeCount: 0 });
    expect(maps.map((m) => m.id)).toContain(b.id);

    await A.deleteMindMap.run({ mindMapId: b.id }, ctx());
    await expect(A.getMindMap.run({ mindMapId: b.id }, ctx())).rejects.toBeInstanceOf(ActionError);
    const activity = await A.listActivity.run({ entityType: "mind_map" }, ctx());
    expect(activity.entries.map((e) => e.summary)).toContain('Deleted mind map "Beta"');
  });
});

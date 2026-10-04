import { z } from "zod/v4";

// What Simone is looking at when she sends a message: the page, and the record open on it.
export const RECORD_TYPES = ["company", "grant", "contact", "task", "project", "note"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const pageContextSchema = z.object({
  path: z.string().max(300),
  record: z
    .object({
      type: z.enum(RECORD_TYPES),
      id: z.string().min(1).max(100),
      label: z.string().max(200).optional()
    })
    .nullable()
    .optional()
});
export type PageContext = z.infer<typeof pageContextSchema>;

const PAGE_NAMES: Record<string, string> = {
  "/today": "Today",
  "/inbox": "Inbox",
  "/projects": "Projects",
  "/people": "People",
  "/radar": "Radar",
  "/grants": "Grants",
  "/grants/calendar": "the grants calendar",
  "/archive": "Archive",
  "/archive/notes": "Notes",
  "/settings": "Settings",
  "/chat": "Chat"
};

export function pageName(path: string): string {
  return PAGE_NAMES[path] ?? path;
}

// The tool that looks up each kind of record by id.
const LOOKUP: Record<RecordType, string> = {
  company: "getCompany (companyId)",
  grant: "searchGrants",
  contact: "contactWarmPaths (contactId) or searchContacts",
  task: "listTasks",
  project: "getProject (projectId)",
  note: "getNote (noteId)"
};

// The extra system message for one turn. Plain facts only; the record's details come from tools.
export function pageContextMessage(ctx: PageContext | undefined): string | undefined {
  if (!ctx) return undefined;
  const lines = [`Simone is on the ${pageName(ctx.path)} page (${ctx.path}).`];
  if (ctx.record) {
    const { type, id, label } = ctx.record;
    lines.push(
      `She has this ${type} open: ${label ? `"${label}", ` : ""}id ${id}. Look it up with ${LOOKUP[type]} if you need its details.`
    );
  }
  return lines.join(" ");
}

// Where a URL already names a record (links from other pages use these).
export function recordFromUrl(path: string, params: URLSearchParams): PageContext["record"] {
  const company = params.get("company");
  if (path === "/radar" && company) return { type: "company", id: company };
  const project = params.get("p");
  if (path === "/projects" && project) return { type: "project", id: project };
  const note = params.get("note");
  if (path === "/archive/notes" && note) return { type: "note", id: note };
  return null;
}

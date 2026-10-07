import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
    .$onUpdateFn(() => new Date());

// ---------------------------------------------------------------- Radar

export const sources = sqliteTable("sources", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["wp_json", "yc_tag", "rss", "grants_gov", "ca_grants", "nsf_awards", "firecrawl"]
  }).notNull(),
  url: text("url").notNull(),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
  lastStatus: text("last_status", { enum: ["ok", "failed"] }),
  lastError: text("last_error"),
  createdAt: createdAt()
});

export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    // Dedupe key. Null when a feed gives no website; normalizedName is the fallback.
    domain: text("domain"),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    website: text("website"),
    stage: text("stage"),
    categories: text("categories", { mode: "json" }).$type<string[]>().notNull().default([]),
    cohortYear: integer("cohort_year"),
    status: text("status", { enum: ["new", "starred", "shortlisted", "passed"] })
      .notNull()
      .default("new"),
    statusNote: text("status_note"),
    statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex("companies_domain_unique").on(t.domain),
    index("companies_normalized_name_idx").on(t.normalizedName),
    index("companies_status_idx").on(t.status),
    index("companies_first_seen_idx").on(t.firstSeenAt)
  ]
);

export const sightings = sqliteTable(
  "sightings",
  {
    id: id(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull(),
    raw: text("raw", { mode: "json" }).notNull()
  },
  (t) => [
    uniqueIndex("sightings_source_external_unique").on(t.sourceId, t.externalId),
    index("sightings_company_idx").on(t.companyId)
  ]
);

// Empty until the phase-2 scoring agent.
export const assessments = sqliteTable(
  "assessments",
  {
    id: id(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    rubricVersion: text("rubric_version").notNull(),
    scores: text("scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
    reason: text("reason"),
    createdAt: createdAt()
  },
  (t) => [index("assessments_company_idx").on(t.companyId)]
);

// A radar company paired with a target brand for the docuseries.
export const pairings = sqliteTable(
  "pairings",
  {
    id: id(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    brandName: text("brand_name").notNull(),
    brandDomain: text("brand_domain"),
    note: text("note"),
    createdAt: createdAt()
  },
  (t) => [index("pairings_company_idx").on(t.companyId)]
);

// ---------------------------------------------------------------- People

export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(),
    email: text("email"),
    // LinkedIn export key; many rows have no email.
    profileUrl: text("profile_url"),
    company: text("company"),
    companyDomain: text("company_domain"),
    position: text("position"),
    connectedOn: text("connected_on"),
    sectors: text("sectors", { mode: "json" }).$type<string[]>().notNull().default([]),
    source: text("source", {
      enum: ["linkedin_csv", "manual", "sample", "newsletter_signup", "google"]
    }).notNull(),
    // Newsletter: the flag is ours; FluentCRM is told on the next sync.
    newsletter: integer("newsletter", { mode: "boolean" }).notNull().default(false),
    newsletterChangedAt: integer("newsletter_changed_at", { mode: "timestamp_ms" }),
    newsletterSyncedAt: integer("newsletter_synced_at", { mode: "timestamp_ms" }),
    fluentcrmId: integer("fluentcrm_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex("contacts_profile_url_unique").on(t.profileUrl),
    uniqueIndex("contacts_email_unique").on(t.email),
    index("contacts_company_idx").on(t.company),
    index("contacts_company_domain_idx").on(t.companyDomain)
  ]
);

// A contact's connection to a radar company or a target brand (warm paths).
export const contactLinks = sqliteTable(
  "contact_links",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    pairingId: text("pairing_id").references(() => pairings.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: ["works_at", "knows", "manual"] }).notNull(),
    note: text("note"),
    createdAt: createdAt()
  },
  (t) => [
    index("contact_links_contact_idx").on(t.contactId),
    index("contact_links_company_idx").on(t.companyId)
  ]
);

// Recent Gmail emails with a contact: metadata and a link only, never the body.
export const contactEmails = sqliteTable(
  "contact_emails",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    // Gmail message id.
    messageId: text("message_id").notNull(),
    // Gmail thread id.
    conversationId: text("conversation_id"),
    subject: text("subject"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    webLink: text("web_link"),
    createdAt: createdAt()
  },
  (t) => [
    uniqueIndex("contact_emails_contact_message_unique").on(t.contactId, t.messageId),
    index("contact_emails_contact_at_idx").on(t.contactId, t.at)
  ]
);

// ---------------------------------------------------------------- Grants

export const grants = sqliteTable(
  "grants",
  {
    id: id(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    agency: text("agency"),
    amountMin: real("amount_min"),
    amountMax: real("amount_max"),
    // Null deadline means rolling.
    deadline: integer("deadline", { mode: "timestamp_ms" }),
    forProfitEligible: integer("for_profit_eligible", { mode: "boolean" }).notNull().default(false),
    url: text("url"),
    description: text("description"),
    status: text("status", { enum: ["watching", "applying", "submitted", "passed"] }),
    raw: text("raw", { mode: "json" }).notNull(),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    uniqueIndex("grants_source_external_unique").on(t.sourceId, t.externalId),
    index("grants_deadline_idx").on(t.deadline),
    index("grants_status_idx").on(t.status)
  ]
);

// ---------------------------------------------------------------- Work

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    // Top of the business → project → task hierarchy.
    business: text("business").notNull().default("Cultured Matter"),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["active", "paused", "done"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("projects_business_idx").on(t.business)]
);

export const captures = sqliteTable(
  "captures",
  {
    id: id(),
    body: text("body").notNull(),
    // Pathname of a photo in the private Vercel Blob store (iPhone Shortcut or Inbox camera).
    imagePath: text("image_path"),
    kind: text("kind", { enum: ["task", "idea", "reference"] }),
    tier: integer("tier"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    filedAt: integer("filed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt()
  },
  (t) => [index("captures_filed_idx").on(t.filedAt)]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    parentTaskId: text("parent_task_id").references((): AnySQLiteColumn => tasks.id, {
      onDelete: "cascade"
    }),
    captureId: text("capture_id").references(() => captures.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["todo", "in_progress", "waiting", "replied", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
      .notNull()
      .default("medium"),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    // The Gmail thread of a follow-up drafted from this task; the hourly reply check watches it.
    emailThreadId: text("email_thread_id"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_status_due_idx").on(t.status, t.dueDate)
  ]
);

// A task that also belongs to other projects besides its home project.
export const taskProjects = sqliteTable(
  "task_projects",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: createdAt()
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.projectId] }),
    index("task_projects_project_idx").on(t.projectId)
  ]
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: id(),
    action: text("action").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    summary: text("summary").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    result: text("result", { mode: "json" }),
    createdAt: createdAt()
  },
  (t) => [index("approvals_status_idx").on(t.status)]
);

// Header notifications she has marked as read. Item ids are built by listNotifications and
// change when the underlying thing changes (e.g. more radar finds), so a fresh event shows again.
export const notificationReads = sqliteTable(
  "notification_reads",
  {
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`)
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index("notification_reads_read_at_idx").on(t.readAt)
  ]
);

// Per-user preferences that are hers rather than Better Auth's (the users table is generated).
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Secret part of the private calendar feed URL (/api/calendar/<token>.ics). Reset replaces it,
  // so the old link stops working.
  calendarToken: text("calendar_token").unique(),
  dailyEmail: integer("daily_email", { mode: "boolean" }).notNull().default(false),
  // When the last daily summary went out; the next one covers what is new since then.
  lastSummaryAt: integer("last_summary_at", { mode: "timestamp_ms" }),
  // Guided tours she has finished or skipped (ids from lib/tours.ts). The welcome tour starts
  // on its own until "welcome" is in here.
  toursSeen: text("tours_seen", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  // Which push notifications she gets, on every device that allowed them.
  pushDaily: integer("push_daily", { mode: "boolean" }).notNull().default(true),
  pushReplies: integer("push_replies", { mode: "boolean" }).notNull().default(true),
  pushApprovals: integer("push_approvals", { mode: "boolean" }).notNull().default(true),
  // The Business / Personal / All switch on Today and Projects. Personal means projects under
  // the "Personal" business (lib/personal.ts).
  workScope: text("work_scope", { enum: ["business", "personal", "all"] })
    .notNull()
    .default("all"),
  // The suggested personal projects are offered once; deleting them never brings them back.
  personalSeeded: integer("personal_seeded", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

// One row per device (browser or installed app) that allowed notifications. The endpoint is the
// push service URL the browser gave us; it is the device's identity. Rows whose endpoint the push
// service reports gone (404/410) are deleted when a push is sent.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    // Encryption keys from PushSubscription.toJSON().keys.
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // "iPhone", "Mac", ... for Settings and the log.
    device: text("device"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)]
);

// ---------------------------------------------------------------- Notes archive

// Notes imported from Apple Notes by a Shortcut (lib/apple-notes.ts, docs/apple-notes-shortcut.md).
// Shortcuts exposes no stable note id, so a note is recognised again by its creation time (to the
// second) plus its title: dedupe_key. A re-run updates the row when the note was edited since.
export const notes = sqliteTable(
  "notes",
  {
    id: id(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    title: text("title").notNull(),
    // Plain text. Locked notes arrive with the title only, so this can be empty.
    body: text("body").notNull().default(""),
    folder: text("folder"),
    noteCreatedAt: integer("note_created_at", { mode: "timestamp_ms" }),
    noteModifiedAt: integer("note_modified_at", { mode: "timestamp_ms" }),
    source: text("source").notNull().default("apple_notes"),
    // Left empty for now: later AI suggestions fill these in.
    kind: text("kind", { enum: ["task", "idea", "reference"] }),
    tier: integer("tier"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    sector: text("sector"),
    personal: integer("personal", { mode: "boolean" }),
    // The Inbox item made from this note with "File to Inbox".
    captureId: text("capture_id").references(() => captures.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("notes_created_idx").on(t.noteCreatedAt), index("notes_folder_idx").on(t.folder)]
);

// ---------------------------------------------------------------- Business profile

// What Cultured Matter is, in one row (one user, one business): the single source of truth the
// Settings → Business page edits and the AI reads (lib/business-profile.ts). Sensitive IDs (EIN,
// SAM UEI) are plain columns; actions log which fields changed, never their values.
export const businessProfile = sqliteTable(
  "business_profile",
  {
    id: text("id").primaryKey().default("main"),
    // About
    name: text("name"),
    tagline: text("tagline"),
    mission: text("mission"),
    story: text("story"),
    founderName: text("founder_name"),
    founderBio: text("founder_bio"),
    // Company details
    entityType: text("entity_type"),
    entityState: text("entity_state"),
    ein: text("ein"),
    samUei: text("sam_uei"),
    address: text("address"),
    foundedOn: text("founded_on"),
    teamSize: text("team_size"),
    revenueStage: text("revenue_stage"),
    // null means she hasn't answered yet.
    womanOwned: integer("woman_owned", { mode: "boolean" }),
    minorityOwned: integer("minority_owned", { mode: "boolean" }),
    // Focus
    sectors: text("sectors", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    fitCriteria: text("fit_criteria", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    targetBrands: text("target_brands", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    // People and partners
    people: text("people", { mode: "json" })
      .$type<{ name: string; role: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    website: text("website"),
    socialLinks: text("social_links", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    notes: text("notes"),
    // Fields the one-time seed (lib/business-seed.ts) has already handled. A field she cleared
    // stays cleared: the seed only touches fields that are not in this list.
    seededFields: text("seeded_fields", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    updatedAt: updatedAt()
  },
  // One user, one business: the table can only ever hold the row "main".
  (t) => [check("business_profile_single_row", sql`${t.id} = 'main'`)]
);

// ---------------------------------------------------------------- Voice guide

// How Simone writes, in one row (Settings → Your voice): the guide the AI follows whenever it
// drafts text for her, and which of her writing it was built from (lib/voice-guide.ts).
export const voiceGuide = sqliteTable(
  "voice_guide",
  {
    id: text("id").primaryKey().default("main"),
    guide: text("guide").notNull().default(""),
    // The samples the last "Build from my writing" used: where each came from and its label.
    sources: text("sources", { mode: "json" })
      .$type<{ source: "gmail" | "website" | "business" | "notes"; label: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    updatedAt: updatedAt()
  },
  (t) => [check("voice_guide_single_row", sql`${t.id} = 'main'`)]
);

// ---------------------------------------------------------------- Mind maps

// A saved mind map (brainstorms, project plans, sponsor maps). Nodes and edges are stored whole
// as JSON, in the shapes lib/mind-map.ts defines and validates; a node may point at a real record
// (a project, task, contact, Radar company, grant or idea). The live business map is not stored:
// getBusinessMap builds it from the tables each time.
export const mindMaps = sqliteTable(
  "mind_maps",
  {
    id: id(),
    title: text("title").notNull(),
    nodes: text("nodes", { mode: "json" })
      .$type<MindMapNodeRow[]>()
      .notNull()
      .default(sql`'[]'`),
    edges: text("edges", { mode: "json" })
      .$type<MindMapEdgeRow[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index("mind_maps_updated_idx").on(t.updatedAt)]
);

// Kept here (not imported from lib/) so the schema has no app dependencies; lib/mind-map.ts
// validates against the same shape.
type MindMapNodeRow = {
  id: string;
  label: string;
  x: number;
  y: number;
  link?: { type: "project" | "task" | "contact" | "company" | "grant" | "idea"; id: string } | null;
};
type MindMapEdgeRow = { id: string; source: string; target: string };

// ---------------------------------------------------------------- Grant applications

// One drafted application per grant (the grant's page and the assistant's draftGrantApplication).
// The funder's questions and her answers are stored together, in the shape
// lib/grant-application.ts defines and validates. Nothing here is ever sent to a funder.
export const grantApplications = sqliteTable("grant_applications", {
  id: id(),
  grantId: text("grant_id")
    .notNull()
    .unique()
    .references(() => grants.id, { onDelete: "cascade" }),
  // needs_questions: the questions couldn't be read (a login wall, no form found), so the page
  // asks her to upload the PDF or paste them. drafted: answers written by the AI. edited: she
  // has changed them since.
  status: text("status", { enum: ["needs_questions", "drafted", "edited"] }).notNull(),
  questions: text("questions", { mode: "json" })
    .$type<GrantQuestionRow[]>()
    .notNull()
    .default(sql`'[]'`),
  // Where the questions came from: the funder's page, linked documents, her upload or paste.
  sources: text("sources", { mode: "json" })
    .$type<GrantSourceRow[]>()
    .notNull()
    .default(sql`'[]'`),
  // Why the questions couldn't be read, shown to her with the upload/paste fallback.
  note: text("note"),
  model: text("model"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

// Kept here so the schema has no app dependencies; lib/grant-application.ts validates the same shape.
type GrantQuestionRow = {
  id: string;
  question: string;
  // The limit as the funder wrote it ("200 words", "1 page"), and the counts when it has one.
  limit: string | null;
  maxWords: number | null;
  maxChars: number | null;
  answer: string;
};
type GrantSourceRow = {
  kind: "page" | "document" | "upload" | "pasted";
  url: string | null;
  title: string;
  read: boolean;
};

// ---------------------------------------------------------------- Log

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: id(),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: text("data", { mode: "json" })
  },
  (t) => [
    index("activity_log_at_idx").on(t.at),
    index("activity_log_entity_idx").on(t.entityType, t.entityId)
  ]
);

// ---------------------------------------------------------------- Auth
// Better Auth tables, generated with `npx auth generate` (usePlural). Better Auth owns these;
// regenerate rather than hand-edit when upgrading it.

const authTimestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: authTimestamp("created_at"),
  updatedAt: authTimestamp("updated_at").$onUpdate(() => new Date())
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: authTimestamp("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
  },
  (t) => [index("sessions_userId_idx").on(t.userId)]
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTimestamp("created_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull()
  },
  (t) => [index("accounts_userId_idx").on(t.userId)]
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at").$onUpdate(() => new Date())
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] })
}));

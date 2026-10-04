import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
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
    // Pathname of a photo in the private Vercel Blob store (iPhone Shortcut captures).
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
    // The Gmail thread of a follow-up drafted from this task; the daily reply check watches it.
    // The column keeps its name from the Outlook version (no table rewrite needed).
    emailThreadId: text("outlook_conversation_id"),
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
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

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

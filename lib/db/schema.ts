import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  doublePrecision,
  serial,
  primaryKey,
  index,
  real,
} from "drizzle-orm/pg-core";

/* ───────────── Better Auth tables ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("participant"), // participant | volunteer | admin
  volunteerStatus: text("volunteer_status").notNull().default("none"), // none | requested | approved | rejected
  displayName: text("display_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ───────────── Taxonomy ───────────── */

export const dimensions = pgTable("dimensions", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
});

export const categories = pgTable("categories", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  dimensionSlug: text("dimension_slug").notNull(),
  tier: integer("tier").notNull(), // 1 right now · 2 next time · 3 long term
  description: text("description"),
  icon: text("icon"),
  isCrisis: boolean("is_crisis").notNull().default(false),
  alsoIn: jsonb("also_in").$type<{ dimension: string; tier: number }[]>().notNull().default([]),
});

export const needTerms = pgTable(
  "need_terms",
  {
    id: serial("id").primaryKey(),
    phrase: text("phrase").notNull(),
    categorySlug: text("category_slug").notNull(),
    weight: real("weight").notNull().default(0.8),
    lang: text("lang").notNull().default("en"),
  },
  (t) => [index("need_terms_cat_idx").on(t.categorySlug)],
);

/* ───────────── Services ───────────── */

export type FieldSource = { source: string; at: string };

/**
 * Rich, structured facts about a service (what someone on the street needs to
 * know before going). Keys and labels live in lib/details.ts (DETAIL_FIELDS).
 * Provenance for each key is kept in field_sources under "details.<key>".
 */
export type ServiceDetails = Partial<{
  walkIn: boolean;
  appointmentRequired: boolean;
  cost: string;
  idRequired: boolean;
  documentsToBring: string[];
  languages: string[];
  ageRange: string;
  genderServed: string;
  accessibility: string;
  whatToExpect: string;
  intakeProcess: string;
  capacityNotes: string;
  transit: string;
  lastHoursChange: string;
}>;

export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organization: text("organization"),
    summary: text("summary"),
    access: text("access"),
    fieldNotes: text("field_notes"),
    internalNotes: text("internal_notes"),
    phone: text("phone"),
    url: text("url"),
    email: text("email"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    hoursText: text("hours_text"),
    schedule: jsonb("schedule").$type<ScheduleSpan[]>(),
    eligibility: text("eligibility"),
    petPolicy: text("pet_policy"),
    police: text("police"),
    rules: text("rules"),
    rulesUrl: text("rules_url"),
    preferred: boolean("preferred").notNull().default(false),
    status: text("status").notNull().default("active"), // active | temporary | unverified | inactive
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    verifiedAt: timestamp("verified_at"),
    verifiedBy: text("verified_by"),
    verificationNote: text("verification_note"),
    fieldSources: jsonb("field_sources").$type<Record<string, FieldSource>>().notNull().default({}),
    lockedFields: jsonb("locked_fields").$type<string[]>().notNull().default([]),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
    lastSeenAt: timestamp("last_seen_at"),
    details: jsonb("details").$type<ServiceDetails>().notNull().default({}),
    /** sha256 of the provider page's main text at the last enrichment check. */
    sourcePageHash: text("source_page_hash"),
    sourceCheckedAt: timestamp("source_checked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("services_status_idx").on(t.status)],
);

/** Weekly opening span. day: 0=Sun…6=Sat; times "HH:MM" 24h local (America/Denver). */
export type ScheduleSpan = { day: number; open: string; close: string };

export const serviceCategories = pgTable(
  "service_categories",
  {
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    categorySlug: text("category_slug").notNull(),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.categorySlug] })],
);

/* ───────────── Governance ───────────── */

export const changeRequests = pgTable(
  "change_requests",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // create | update | archive | notice
    serviceId: text("service_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    summary: text("summary"),
    source: text("source").notNull(), // volunteer | admin | feed:<name> | ai
    proposedBy: text("proposed_by"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (t) => [index("change_requests_status_idx").on(t.status)],
);

export const serviceRevisions = pgTable("service_revisions", {
  id: serial("id").primaryKey(),
  serviceId: text("service_id").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  changeRequestId: integer("change_request_id"),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ───────────── Plans ───────────── */

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  shareToken: text("share_token").notNull().unique(),
  ownerId: text("owner_id"),
  forLabel: text("for_label"),
  showLabel: boolean("show_label").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  intakeText: text("intake_text"),
  navigatorName: text("navigator_name"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const planItems = pgTable(
  "plan_items",
  {
    id: serial("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    serviceId: text("service_id").notNull(),
    tier: integer("tier").notNull(),
    note: text("note"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("plan_items_plan_idx").on(t.planId)],
);

/* ───────────── Knowledge & ops ───────────── */

export type TreeNode = { q: string; text?: string; opts?: [string, string][]; links?: string[] };

export const decisionTrees = pgTable("decision_trees", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  nodes: jsonb("nodes").$type<Record<string, TreeNode>>().notNull(),
  position: integer("position").notNull().default(0),
});

export const gaps = pgTable("gaps", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("gap"), // gap | followup
  title: text("title").notNull(),
  ideas: text("ideas"),
  owner: text("owner"),
  status: text("status").notNull().default("Not started"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().default("running"),
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  error: text("error"),
});

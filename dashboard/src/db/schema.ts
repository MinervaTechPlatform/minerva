import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  varchar,
  bigint,
  pgEnum,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Auth.js tables ──────────────────────────────────────────────
// These are managed by @auth/drizzle-adapter — do NOT rename columns.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  isActive: boolean("is_active").default(true).notNull(),

  // Audit
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ─── Enums ───────────────────────────────────────────────────────

export const orgPlanEnum = pgEnum("org_plan", ["trial", "pro", "enterprise"]);
export const orgMemberRoleEnum = pgEnum("org_member_role", ["owner", "admin", "member"]);

// ─── Organizations ───────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: orgPlanEnum("plan").default("trial").notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  // Audit
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
});

// ─── Org Members (user ↔ org many-to-many) ───────────────────────

export const orgMembers = pgTable(
  "org_members",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: orgMemberRoleEnum("role").default("member").notNull(),
    createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.orgId] }) })
);

// ─── Businesses ──────────────────────────────────────────────────

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  schemaName: text("schema_name").notNull(), // e.g. bus_<businessId> — one schema per business
  industry: text("industry"),                         // e.g. warehouse, fintech, real_estate
  goal: varchar("goal", { length: 50 }),              // e.g. leads, customer_support
  allowedDomains: jsonb("allowed_domains").default([]),
  allowedIps: jsonb("allowed_ips").default([]),
  isActive: boolean("is_active").default(true).notNull(),

  // Audit
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
});

// ─── User Access (user ↔ business many-to-many) ──────────────────
// Controls which users can access which businesses within their org.

export const userAccess = pgTable(
  "user_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.businessId] }) })
);

// ─── API Keys (public schema, scoped per business) ───────────────

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  apiKey: text("api_key").unique().notNull(),
  apiSecretHash: text("api_secret_hash").notNull(),
  name: text("name"),              // human-readable label
  keyPrefix: text("key_prefix"),   // e.g. "mnrv_XXXX..."
  lastUsed: timestamp("last_used", { withTimezone: true, mode: "date" }),
  isActive: boolean("is_active").default(true).notNull(),

  // Audit
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
});

// ─── System Settings ─────────────────────────────────────────────

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),

  // Audit
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
});

// ─── Types ───────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrgMember = typeof orgMembers.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type UserAccess = typeof userAccess.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;

/**
 * tenant-schema.ts
 *
 * Defines the table structure for per-org tenant schemas (named org_<orgId>).
 *
 * HOW IT WORKS:
 * - `tenantTableDefs` holds plain pgTable definitions — used for TypeScript
 *   type inference (InferSelectModel, etc.) and as a reference template.
 * - `getTenantSchema(orgId)` returns the same table definitions but bound to
 *   the correct PostgreSQL schema at runtime, so all Drizzle queries run
 *   inside `org_<orgId>` instead of `public`.
 *
 * USAGE:
 *   const t = getTenantSchema("abc-123");
 *   const docs = await db.select().from(t.documents);
 */

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ─── Shared enums (declared on public schema, referenced here for typing) ──

export const ingestionStatusEnum = pgEnum("ingestion_status", [
  "initiated",
  "in_progress",
  "success",
  "failed",
]);

export const sessionChannelEnum = pgEnum("session_channel", [
  "web",
  "whatsapp",
  "phone",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "ended",
  "abandoned",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

// ─── Helper: audit columns ───────────────────────────────────────────────────

const auditCols = {
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
};

// ─── Template table definitions (for type inference) ────────────────────────
// These are NOT queried directly — they only exist so TypeScript can infer
// row types. Actual queries use the schema-bound versions from getTenantSchema().

const configsTemplate = pgTable("configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  configKey: text("config_key").notNull().unique(),
  configValue: jsonb("config_value").notNull(),
  description: text("description"),
  ...auditCols,
});

const apiKeysTemplate = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  apiKey: text("api_key").unique().notNull(),
  apiSecretHash: text("api_secret_hash").notNull(),
  name: text("name"),              // human-readable label
  keyPrefix: text("key_prefix"),   // e.g. "mnrv_XXXX..."
  lastUsed: timestamp("last_used", { withTimezone: true, mode: "date" }),
  isActive: boolean("is_active").default(true).notNull(),
  ...auditCols,
});

const documentsTemplate = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),   // pdf, docx, txt, etc.
  s3Path: text("s3_path").notNull(),       // S3 object key
  fileUrl: text("file_url"),               // public/presigned base URL
  size: integer("size"),                   // bytes
  mimeType: text("mime_type"),
  version: integer("version").default(1),
  chunkCount: integer("chunk_count"),
  embeddingModel: text("embedding_model"),
  ingestionStatus: text("ingestion_status").default("initiated"),
  isActive: boolean("is_active").default(true).notNull(),
  ...auditCols,
});

const ingestionJobsTemplate = pgTable("ingestion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").notNull(),
  documentIds: uuid("document_ids").array().notNull().default([]),
  status: text("status").notNull().default("initiated"), // initiated | in_progress | success | failed
  errorMessage: text("error_message"),
  chunksProcessed: integer("chunks_processed").default(0),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  ...auditCols,
});

const tenantSessionsTemplate = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel: text("channel").notNull(),          // web | whatsapp | phone
  userIdentifier: text("user_identifier"),     // external end-user id / phone / email
  language: text("language"),
  status: text("status").default("active"),    // active | ended | abandoned
  conversationSummary: text("conversation_summary"),
  audioS3Path: text("audio_s3_path"),
  goalStateJson: jsonb("goal_state_json"),
  lastActivity: timestamp("last_activity", { withTimezone: true, mode: "date" }),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  ...auditCols,
});

const messagesTemplate = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),    // FK → sessions.id (enforced via FK in setup SQL)
  role: text("role").notNull(),               // user | assistant | system
  content: text("content").notNull(),
  audioS3Path: text("audio_s3_path"),
  isUnknown: boolean("is_unknown").default(false),
  ragContext: jsonb("rag_context"),
  ...auditCols,
});

const usageRecordsTemplate = pgTable("usage_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  messageId: uuid("message_id").notNull(),
  sttSeconds: integer("stt_seconds"),
  llmTokens: integer("llm_tokens"),
  ttsCharacters: integer("tts_characters"),
  costEstimate: text("cost_estimate"),         // stored as numeric string to avoid float issues
  ...auditCols,
});

const unknownQueriesTemplate = pgTable("unknown_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  messageId: uuid("message_id").notNull(),
  queryText: text("query_text").notNull(),
  resolved: boolean("resolved").default(false),
  resolvedBy: uuid("resolved_by"),             // logical FK to public.users.id
  ...auditCols,
});

const feedbackTemplate = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  messageId: uuid("message_id").notNull(),
  rating: integer("rating"),   // 1–5
  comment: text("comment"),
  ...auditCols,
});

// ─── TypeScript types (inferred from templates) ──────────────────────────────

export type TenantConfig = InferSelectModel<typeof configsTemplate>;
export type TenantApiKey = InferSelectModel<typeof apiKeysTemplate>;
export type TenantDocument = InferSelectModel<typeof documentsTemplate>;
export type TenantIngestionJob = InferSelectModel<typeof ingestionJobsTemplate>;
export type TenantSession = InferSelectModel<typeof tenantSessionsTemplate>;
export type TenantMessage = InferSelectModel<typeof messagesTemplate>;
export type TenantUsageRecord = InferSelectModel<typeof usageRecordsTemplate>;
export type TenantUnknownQuery = InferSelectModel<typeof unknownQueriesTemplate>;
export type TenantFeedback = InferSelectModel<typeof feedbackTemplate>;

export type NewTenantDocument = InferInsertModel<typeof documentsTemplate>;
export type NewTenantApiKey = InferInsertModel<typeof apiKeysTemplate>;
export type NewTenantSession = InferInsertModel<typeof tenantSessionsTemplate>;
export type NewTenantMessage = InferInsertModel<typeof messagesTemplate>;

// ─── Schema-bound factory ────────────────────────────────────────────────────

/**
 * Returns Drizzle table references scoped to the `org_<orgId>` PostgreSQL schema.
 * All queries on the returned tables will execute inside that schema.
 *
 * @example
 * const t = getTenantSchema("550e8400-e29b-41d4-a716-446655440000");
 * const docs = await db.select().from(t.documents);
 */
export function getTenantSchema(orgId: string) {
  const schema = pgSchema(`org_${orgId}`);

  return {
    configs: schema.table("configs", {
      id: uuid("id").defaultRandom().primaryKey(),
      configKey: text("config_key").notNull().unique(),
      configValue: jsonb("config_value").notNull(),
      description: text("description"),
      ...auditCols,
    }),

    apiKeys: schema.table("api_keys", {
      id: uuid("id").defaultRandom().primaryKey(),
      apiKey: text("api_key").unique().notNull(),
      apiSecretHash: text("api_secret_hash").notNull(),
      name: text("name"),
      keyPrefix: text("key_prefix"),
      lastUsed: timestamp("last_used", { withTimezone: true, mode: "date" }),
      isActive: boolean("is_active").default(true).notNull(),
      ...auditCols,
    }),

    documents: schema.table("documents", {
      id: uuid("id").defaultRandom().primaryKey(),
      filename: text("filename").notNull(),
      fileType: text("file_type").notNull(),
      s3Path: text("s3_path").notNull(),
      fileUrl: text("file_url"),
      size: integer("size"),
      mimeType: text("mime_type"),
      version: integer("version").default(1),
      chunkCount: integer("chunk_count"),
      embeddingModel: text("embedding_model"),
      ingestionStatus: text("ingestion_status").default("initiated"),
      isActive: boolean("is_active").default(true).notNull(),
      ...auditCols,
    }),

    ingestionJobs: schema.table("ingestion_jobs", {
      id: uuid("id").defaultRandom().primaryKey(),
      businessId: uuid("business_id").notNull(),
      documentIds: uuid("document_ids").array().notNull().default([]),
      status: text("status").notNull().default("initiated"),
      errorMessage: text("error_message"),
      chunksProcessed: integer("chunks_processed").default(0),
      startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
      completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
      ...auditCols,
    }),

    sessions: schema.table("sessions", {
      id: uuid("id").defaultRandom().primaryKey(),
      channel: text("channel").notNull(),
      userIdentifier: text("user_identifier"),
      language: text("language"),
      status: text("status").default("active"),
      conversationSummary: text("conversation_summary"),
      audioS3Path: text("audio_s3_path"),
      goalStateJson: jsonb("goal_state_json"),
      lastActivity: timestamp("last_activity", { withTimezone: true, mode: "date" }),
      endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
      ...auditCols,
    }),

    messages: schema.table("messages", {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id").notNull(),
      role: text("role").notNull(),
      content: text("content").notNull(),
      audioS3Path: text("audio_s3_path"),
      isUnknown: boolean("is_unknown").default(false),
      ragContext: jsonb("rag_context"),
      ...auditCols,
    }),

    usageRecords: schema.table("usage_records", {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id").notNull(),
      messageId: uuid("message_id").notNull(),
      sttSeconds: integer("stt_seconds"),
      llmTokens: integer("llm_tokens"),
      ttsCharacters: integer("tts_characters"),
      costEstimate: text("cost_estimate"),
      ...auditCols,
    }),

    unknownQueries: schema.table("unknown_queries", {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id").notNull(),
      messageId: uuid("message_id").notNull(),
      queryText: text("query_text").notNull(),
      resolved: boolean("resolved").default(false),
      resolvedBy: uuid("resolved_by"),
      ...auditCols,
    }),

    feedback: schema.table("feedback", {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id").notNull(),
      messageId: uuid("message_id").notNull(),
      rating: integer("rating"),
      comment: text("comment"),
      ...auditCols,
    }),
  };
}

/** Convenience type — shape returned by getTenantSchema() */
export type TenantTables = ReturnType<typeof getTenantSchema>;

/**
 * business-schema.ts
 *
 * Defines the table structure for per-business schemas (named bus_<businessId>).
 *
 * HOW IT WORKS:
 * - `getBusinessSchema(businessId)` returns table definitions bound to the
 *   correct PostgreSQL schema at runtime, so all Drizzle queries run inside
 *   `bus_<businessId>` instead of `public`.
 *
 * USAGE:
 *   const t = getBusinessSchema("abc-123");
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
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ─── Helper: audit columns ───────────────────────────────────────────────────

const auditCols = {
  createdBy: uuid("created_by"),
  createdOn: timestamp("created_on", { withTimezone: true, mode: "date" }).defaultNow(),
  lastUpdatedBy: uuid("last_updated_by"),
  lastUpdatedOn: timestamp("last_updated_on", { withTimezone: true, mode: "date" }).defaultNow(),
};

// ─── Template table definitions (for type inference) ────────────────────────
// These are NOT queried directly — they only exist so TypeScript can infer
// row types. Actual queries use the schema-bound versions from getBusinessSchema().

const configsTemplate = pgTable("configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  configKey: text("config_key").notNull().unique(),
  configValue: jsonb("config_value").notNull(),
  description: text("description"),
  ...auditCols,
});

const documentsTemplate = pgTable("documents", {
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
  isActive: boolean("is_active").default(true).notNull(),
  ...auditCols,
});

const ingestionJobsTemplate = pgTable("ingestion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentIds: uuid("document_ids").array().notNull().default([]),
  status: text("status").notNull().default("initiated"),
  ecsTaskArn: text("ecs_task_arn"),
  errorMessage: text("error_message"),
  chunksProcessed: integer("chunks_processed").default(0),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  ...auditCols,
});

const sessionsTemplate = pgTable("sessions", {
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
});

const messagesTemplate = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  role: text("role").notNull(),
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
  costEstimate: text("cost_estimate"),
  ...auditCols,
});

const unknownQueriesTemplate = pgTable("unknown_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  messageId: uuid("message_id").notNull(),
  queryText: text("query_text").notNull(),
  resolved: boolean("resolved").default(false),
  resolvedBy: uuid("resolved_by"),
  ...auditCols,
});

const feedbackTemplate = pgTable("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  messageId: uuid("message_id").notNull(),
  rating: integer("rating"),
  comment: text("comment"),
  ...auditCols,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type BusinessConfig = InferSelectModel<typeof configsTemplate>;
export type BusinessDocument = InferSelectModel<typeof documentsTemplate>;
export type BusinessIngestionJob = InferSelectModel<typeof ingestionJobsTemplate>;
export type BusinessSession = InferSelectModel<typeof sessionsTemplate>;
export type BusinessMessage = InferSelectModel<typeof messagesTemplate>;
export type BusinessUsageRecord = InferSelectModel<typeof usageRecordsTemplate>;
export type BusinessUnknownQuery = InferSelectModel<typeof unknownQueriesTemplate>;
export type BusinessFeedback = InferSelectModel<typeof feedbackTemplate>;

export type NewBusinessDocument = InferInsertModel<typeof documentsTemplate>;
export type NewBusinessSession = InferInsertModel<typeof sessionsTemplate>;
export type NewBusinessMessage = InferInsertModel<typeof messagesTemplate>;

// ─── Schema-bound factory ─────────────────────────────────────────────────────

/**
 * Returns Drizzle table references scoped to the `bus_<businessId>` PostgreSQL schema.
 * All queries on the returned tables will execute inside that schema.
 *
 * @example
 * const t = getBusinessSchema("550e8400-e29b-41d4-a716-446655440000");
 * const docs = await db.select().from(t.documents);
 */
export function getBusinessSchema(businessId: string) {
  const schema = pgSchema(`bus_${businessId}`);

  return {
    configs: schema.table("configs", {
      id: uuid("id").defaultRandom().primaryKey(),
      configKey: text("config_key").notNull().unique(),
      configValue: jsonb("config_value").notNull(),
      description: text("description"),
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
      isActive: boolean("is_active").default(true).notNull(),
      ...auditCols,
    }),

    ingestionJobs: schema.table("ingestion_jobs", {
      id: uuid("id").defaultRandom().primaryKey(),
      documentIds: uuid("document_ids").array().notNull().default([]),
      status: text("status").notNull().default("initiated"),
      ecsTaskArn: text("ecs_task_arn"),
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

/** Shape returned by getBusinessSchema() */
export type BusinessTables = ReturnType<typeof getBusinessSchema>;

/**
 * setup-business.ts
 *
 * Creates the PostgreSQL schema and all tables for a new business.
 *
 * One schema is created per business, named `bus_<businessId>`.
 * Called automatically (fire-and-forget) when a new business is created via
 * POST /api/businesses.
 *
 * Usage:
 *   import { createBusinessSchema } from "@/db/setup-business";
 *   await createBusinessSchema(business.id);
 */

import { pool } from "@/db";

/**
 * Creates a new PostgreSQL schema `bus_<businessId>` with all business tables.
 * Safe to call multiple times — uses IF NOT EXISTS guards throughout.
 */
export async function createBusinessSchema(businessId: string): Promise<void> {
  const schemaName = `bus_${businessId}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Create the schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // 2. Set search_path for this transaction
    await client.query(`SET LOCAL search_path TO "${schemaName}"`);

    // 3. Create all business tables
    await client.query(`
      -- 1. Configurations
      CREATE TABLE IF NOT EXISTS configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key TEXT NOT NULL UNIQUE,
        config_value JSONB NOT NULL,
        description TEXT,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 2. Documents (ingestion status derived from latest ingestion_jobs row)
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        file_url TEXT,
        size INTEGER,
        mime_type TEXT,
        version INTEGER DEFAULT 1,
        chunk_count INTEGER,
        embedding_model TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 3. Ingestion Jobs (schema itself scopes jobs to this business)
      CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_ids UUID[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'initiated',
        ecs_task_arn TEXT,
        error_message TEXT,
        chunks_processed INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 4. Sessions (chat conversations, NOT auth sessions)
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel TEXT NOT NULL,
        user_identifier TEXT,
        language TEXT,
        status TEXT DEFAULT 'active',
        conversation_summary TEXT,
        audio_s3_path TEXT,
        goal_state_json JSONB,
        last_activity TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 5. Messages
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        audio_s3_path TEXT,
        is_unknown BOOLEAN DEFAULT false,
        rag_context JSONB,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 6. Usage Records
      CREATE TABLE IF NOT EXISTS usage_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        metrics JSONB,
        latency_ms JSONB,
        cost_estimate FLOAT,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 7. Unknown Queries
      CREATE TABLE IF NOT EXISTS unknown_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        query_text TEXT NOT NULL,
        resolved BOOLEAN DEFAULT false,
        resolved_by UUID,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- 8. Feedback
      CREATE TABLE IF NOT EXISTS feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_by UUID,
        created_on TIMESTAMPTZ DEFAULT now(),
        last_updated_by UUID,
        last_updated_on TIMESTAMPTZ DEFAULT now()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_sessions_user_identifier ON sessions(user_identifier);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_on ON sessions(created_on);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_on ON messages(created_on);
      CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_on ON ingestion_jobs(created_on);
    `);

    await client.query("COMMIT");
    console.log(`[setup-business] Schema "${schemaName}" created successfully.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[setup-business] Failed to create schema "${schemaName}":`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Drops a business schema and all its tables.
 * Use with caution — this is irreversible.
 */
export async function dropBusinessSchema(businessId: string): Promise<void> {
  const schemaName = `bus_${businessId}`;
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    console.log(`[setup-business] Schema "${schemaName}" dropped.`);
  } finally {
    client.release();
  }
}

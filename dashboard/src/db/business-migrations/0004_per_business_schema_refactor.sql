-- Migration: 0004_per_business_schema_refactor.sql
-- 
-- Refactors existing org_* schemas that are being transitioned to bus_* schemas.
-- This migration handles cleanup of old columns no longer needed in bus_* schemas:
-- 1. Drop ingestion_status from documents (status now derived from latest ingestion_jobs row)
-- 2. Drop business_id from ingestion_jobs (schema itself is scoped to a business)
-- 3. Drop api_keys table (moved to public schema with a businessId FK)
-- 4. Add index on ingestion_jobs(created_on) for efficient latest-job lookups

-- Documents: remove ingestion_status column
ALTER TABLE documents
  DROP COLUMN IF EXISTS ingestion_status;

-- Ingestion jobs: remove business_id column (schema is already business-scoped)
ALTER TABLE ingestion_jobs
  DROP COLUMN IF EXISTS business_id;

-- API keys: remove table entirely (now lives in public schema)
DROP TABLE IF EXISTS api_keys;

-- Index for efficient "latest job" queries
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_on ON ingestion_jobs(created_on);

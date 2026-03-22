-- Migration: 0002_add_business_id_to_ingestion_jobs.sql
-- Adds the business_id column to ingestion_jobs so jobs can be scoped
-- to a specific business (not just the org schema).

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS business_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

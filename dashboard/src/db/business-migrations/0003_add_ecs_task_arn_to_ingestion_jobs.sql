-- Migration: 0003_add_ecs_task_arn_to_ingestion_jobs.sql
-- Stores the ECS task ARN returned when an ingestion task is launched.

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS ecs_task_arn TEXT;

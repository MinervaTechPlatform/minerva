-- Migration: Revert usage_records to JSONB metrics/latency columns
-- Generated on 2026-03-28

-- 1. Add metrics and latency_ms columns if they don't exist
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS latency_ms JSONB;

-- 2. Migrate data from granular columns to metrics if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'usage_records' AND column_name = 'stt_seconds') THEN
        UPDATE usage_records 
        SET metrics = jsonb_build_object(
            'consumption', jsonb_build_object(
                'stt_seconds', stt_seconds,
                'llm_tokens', llm_tokens,
                'tts_characters', tts_characters
            )
        )
        WHERE metrics IS NULL;
    END IF;
END $$;

-- 3. Transition cost_estimate to DOUBLE PRECISION (if it was text)
ALTER TABLE usage_records ALTER COLUMN cost_estimate TYPE DOUBLE PRECISION USING cost_estimate::DOUBLE PRECISION;

-- 4. Drop granular columns if they exist
ALTER TABLE usage_records DROP COLUMN IF EXISTS stt_seconds;
ALTER TABLE usage_records DROP COLUMN IF EXISTS llm_tokens;
ALTER TABLE usage_records DROP COLUMN IF EXISTS tts_characters;

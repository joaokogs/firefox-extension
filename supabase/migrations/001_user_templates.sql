-- Migration: user_templates table for cross-device sync
-- Apply this via Supabase CLI: supabase db push
-- Or manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_templates (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own templates"
  ON user_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON user_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON user_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON user_templates FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_templates_updated_at
  ON user_templates(updated_at);

-- Enable realtime for the table (Supabase Realtime) -- idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_templates;
  END IF;
END $$;
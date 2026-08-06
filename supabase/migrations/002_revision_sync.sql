-- Migration: add revision column and sync_data RPC for revision-based sync
-- Apply via Supabase SQL Editor or supabase db push

-- Add revision column with default 0 for existing rows
ALTER TABLE user_templates ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

-- Migrate legacy snapshots when the old sync_data table exists. Existing
-- user_templates rows always win and are never overwritten.
DO $$
BEGIN
  IF to_regclass('public.sync_data') IS NOT NULL THEN
    EXECUTE $migration$
      INSERT INTO public.user_templates (user_id, data, revision, updated_at, created_at)
      SELECT user_id, app_data, version::integer, updated_at, updated_at
      FROM public.sync_data
      WHERE jsonb_typeof(app_data) = 'object'
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_templates existing
          WHERE existing.user_id = public.sync_data.user_id
        )
      ON CONFLICT (user_id) DO NOTHING
    $migration$;
  END IF;
END
$$;

-- Backfill: set revision to 1 for rows that already have data (mark them as v1)
-- This ensures new clients with baseRevision=0 will get a conflict on first push,
-- receive the snapshot, and then sync properly from revision 1 onward.
UPDATE user_templates SET revision = 1 WHERE revision = 0 AND data IS NOT NULL AND data::text <> '{}';

-- Clean existing snapshots: remove _tombstones and local-only settings fields
-- These fields must not be present in the remote snapshot.
UPDATE user_templates
SET data = data - '_tombstones'
WHERE data ? '_tombstones';

-- Remove local-only settings fields from existing snapshots
UPDATE user_templates
SET data = jsonb_set(data, '{settings}',
  (data->'settings') - 'wallpaper' - 'uploadedBackgrounds' - 'lastBoardId'
  - 'openInNewTab' - 'recentSearches' - 'editMode' - 'locale'
)
WHERE data->'settings' IS NOT NULL;

-- The application reads user_templates directly and writes through sync_data.
DROP TRIGGER IF EXISTS user_templates_updated_at ON public.user_templates;

CREATE TRIGGER user_templates_updated_at
BEFORE UPDATE ON public.user_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

REVOKE ALL ON public.user_templates FROM anon, authenticated;
GRANT SELECT ON public.user_templates TO authenticated;

DROP POLICY IF EXISTS "Users can read own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON public.user_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON public.user_templates;

CREATE POLICY "Users with access can read own templates"
ON public.user_templates
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) = user_id
  AND public.has_sync_access((select auth.uid()))
);

-- RPC: revision-checked sync
-- Validates that the caller is authenticated and matches the target user_id.
-- Uses SELECT ... FOR UPDATE to serialize concurrent writes per user_id.
CREATE OR REPLACE FUNCTION sync_data(
  user_id_param UUID,
  new_data JSONB,
  base_revision INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  caller_id UUID;
  current_revision INTEGER;
  current_data JSONB;
BEGIN
  -- Authenticate caller
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Anonymous access is not allowed';
  END IF;
  IF caller_id <> user_id_param THEN
    RAISE EXCEPTION 'Cannot access data of another user';
  END IF;
  IF NOT public.has_sync_access(user_id_param) THEN
    RAISE EXCEPTION 'Sync access is required';
  END IF;

  -- Lock and fetch the current row for this user
  SELECT revision, data INTO current_revision, current_data
  FROM user_templates
  WHERE user_id = user_id_param
  FOR UPDATE;

  -- If no row exists, create one with revision 0
  IF NOT FOUND THEN
    current_revision := 0;
    current_data := '{"boards":[],"settings":{},"installedAt":0}'::JSONB;
    INSERT INTO user_templates (user_id, data, revision, updated_at, created_at)
    VALUES (user_id_param, current_data, 0, now(), now());
  END IF;

  -- Validate revision
  IF base_revision <> current_revision THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'revision', current_revision,
      'snapshot', current_data
    );
  END IF;

  -- Accept: store new data and increment revision
  current_revision := current_revision + 1;

  UPDATE user_templates
  SET data = new_data,
      revision = current_revision,
      updated_at = now()
  WHERE user_id = user_id_param;

  RETURN jsonb_build_object(
    'accepted', true,
    'revision', current_revision
  );
END;
$$;

-- Restrict execution to authenticated users only
REVOKE EXECUTE ON FUNCTION sync_data(UUID, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_data(UUID, JSONB, INTEGER) TO authenticated;

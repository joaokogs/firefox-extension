import { getSupabaseClient } from '@shared/supabase/client';
import type { AppSettings, Widget, Workspace } from '@shared/types';
import { LOCAL_ONLY_SETTINGS_KEYS } from '@shared/types/constants';

const WORKSPACES_TABLE = 'user_workspaces';
const PREFERENCES_TABLE = 'user_preferences';

interface RawWorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  position: number;
  data: unknown;
  revision: number;
  updated_at: string;
  created_at: string;
  client_updated_at: string | null;
  deleted_at: string | null;
}

interface RawPreferencesRow {
  user_id: string;
  data: unknown;
  revision: number;
  updated_at: string;
  created_at: string;
}

export interface RemoteWorkspacesResult {
  workspaces: Workspace[];
  revisions: Record<string, number>;
  updatedAt: string | null;
}

export interface RemotePreferencesResult {
  settings: Partial<AppSettings> | null;
  revision: number;
  updatedAt: string | null;
}

function isWorkspacePayload(value: unknown): value is { widgets: Widget[] } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { widgets?: unknown };
  return Array.isArray(candidate.widgets);
}

function parseTimestamp(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeWorkspace(row: RawWorkspaceRow): Workspace {
  if (!isWorkspacePayload(row.data)) {
    throw new Error('SYNC_INVALID_REMOTE_WORKSPACE');
  }

  const createdAt = parseTimestamp(row.created_at, Date.now());
  const updatedAt = parseTimestamp(row.client_updated_at ?? row.updated_at, createdAt);

  return {
    id: row.id,
    title: row.name,
    position: row.position ?? 0,
    widgets: row.data.widgets,
    createdAt,
    updatedAt,
    ...(row.deleted_at ? { deletedAt: parseTimestamp(row.deleted_at, updatedAt) } : {}),
  };
}

function cleanSettingsForRemote(settings: AppSettings): Partial<AppSettings> {
  const clean = { ...settings };
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    delete clean[key];
  }
  return clean;
}

export async function fetchRemoteWorkspaces(userId: string): Promise<RemoteWorkspacesResult> {
  const { data, error } = await getSupabaseClient()
    .from(WORKSPACES_TABLE)
    .select('id, user_id, name, position, data, revision, updated_at, created_at, client_updated_at, deleted_at')
    .eq('user_id', userId);

  if (error) throw error;

  const rows = (data ?? []) as RawWorkspaceRow[];
  const workspaces: Workspace[] = [];
  const revisions: Record<string, number> = {};
  let updatedAt: string | null = null;

  for (const row of rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    try {
      const workspace = normalizeWorkspace(row);
      workspaces.push(workspace);
      revisions[row.id] = row.revision ?? 0;
      if (row.updated_at && (!updatedAt || row.updated_at > updatedAt)) {
        updatedAt = row.updated_at;
      }
    } catch {
      console.warn('Sync: ignored invalid remote workspace', row.id);
    }
  }

  return { workspaces, revisions, updatedAt };
}

export async function fetchRemotePreferences(userId: string): Promise<RemotePreferencesResult> {
  const { data, error } = await getSupabaseClient()
    .from(PREFERENCES_TABLE)
    .select('data, revision, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { settings: null, revision: 0, updatedAt: null };

  const row = data as RawPreferencesRow;
  const settings = typeof row.data === 'object' && row.data !== null ? (row.data as Partial<AppSettings>) : null;

  return {
    settings,
    revision: row.revision ?? 0,
    updatedAt: row.updated_at,
  };
}

export interface SyncWorkspacePushResult {
  accepted: boolean;
  revision: number;
}

export async function pushWorkspace(
  userId: string,
  workspace: Workspace,
  baseRevision: number,
  position: number,
): Promise<SyncWorkspacePushResult> {
  const writeId = `${workspace.id}:${workspace.updatedAt}:${workspace.deletedAt ?? 'active'}`;

  const { data, error } = await getSupabaseClient().rpc('sync_workspace', {
    user_id_param: userId,
    workspace_id_param: workspace.id,
    name_param: workspace.title,
    position_param: position,
    new_data: { widgets: workspace.deletedAt ? [] : workspace.widgets },
    base_revision: baseRevision,
    client_updated_at_param: new Date(workspace.updatedAt).toISOString(),
    deleted_at_param: workspace.deletedAt ? new Date(workspace.deletedAt).toISOString() : null,
    write_id_param: writeId,
  });

  if (error) throw error;

  const result = data as { accepted: boolean; revision: number } | null;
  return {
    accepted: result?.accepted ?? false,
    revision: result?.revision ?? 0,
  };
}

export interface SyncPreferencesPushResult {
  accepted: boolean;
  revision: number;
}

export async function pushPreferences(
  userId: string,
  settings: AppSettings,
  baseRevision: number,
): Promise<SyncPreferencesPushResult> {
  const clean = cleanSettingsForRemote(settings);
  const writeId = `preferences:${userId}:${baseRevision}:${JSON.stringify(clean)}`;

  const { data, error } = await getSupabaseClient().rpc('sync_preferences', {
    user_id_param: userId,
    new_data: clean,
    base_revision: baseRevision,
    write_id_param: writeId,
  });

  if (error) throw error;

  const result = data as { accepted: boolean; revision: number } | null;
  return {
    accepted: result?.accepted ?? false,
    revision: result?.revision ?? 0,
  };
}

let channelCleanup: (() => void) | null = null;

export function subscribeToRealtime(
  userId: string,
  onRemoteChange: () => void,
): () => void {
  unsubscribeRealtime();

  const supabase = getSupabaseClient();

  const channel = supabase
    .channel(`user_workspaces:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: WORKSPACES_TABLE,
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onRemoteChange();
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: PREFERENCES_TABLE,
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onRemoteChange();
      },
    )
    .subscribe((status) => {
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        channelCleanup = null;
      }
    });

  channelCleanup = () => {
    supabase.removeChannel(channel);
    channelCleanup = null;
  };

  return channelCleanup;
}

export function unsubscribeRealtime(): void {
  if (channelCleanup) {
    channelCleanup();
    channelCleanup = null;
  }
}

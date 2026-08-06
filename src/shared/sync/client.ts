import { getSupabaseClient } from '@shared/supabase/client';
import type { AppData } from '@shared/types';
import { LOCAL_ONLY_SETTINGS_KEYS } from '@shared/types/constants';
import type { RemoteTemplate } from './types';

const TABLE = 'user_templates';

export async function fetchRemote(userId: string): Promise<{ data: AppData | null; revision: number; updatedAt: string | null }> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select('data, revision, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) return { data: null, revision: 0, updatedAt: null };

  const remoteData = (data as RemoteTemplate).data;
  if (!isAppData(remoteData)) {
    throw new Error('SYNC_INVALID_REMOTE_DATA');
  }

  return {
    data: remoteData,
    revision: (data as RemoteTemplate).revision ?? 0,
    updatedAt: (data as RemoteTemplate).updated_at,
  };
}

export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppData>;
  if (!Array.isArray(candidate.boards) || !candidate.settings || typeof candidate.settings !== 'object') {
    return false;
  }

  return candidate.boards.every((board) => {
    if (!board || typeof board !== 'object' || !Array.isArray(board.widgets)) return false;
    return board.widgets.every((widget) => {
      if (!widget || typeof widget !== 'object') return false;
      if (widget.type === 'links' || widget.type === 'todo') {
        return Array.isArray(widget.items);
      }
      return true;
    });
  });
}

export interface SyncPushResult {
  accepted: boolean;
  revision: number;
  snapshot?: AppData;
}

export async function pushSnapshotWithRevision(
  userId: string,
  appData: AppData,
  baseRevision: number,
): Promise<SyncPushResult> {
  const clean = cleanForRemote(appData);

  const { data, error } = await getSupabaseClient()
    .rpc('sync_data', {
      user_id_param: userId,
      new_data: clean,
      base_revision: baseRevision,
    });

  if (error) throw error;

  const result = data as { accepted: boolean; revision: number; snapshot?: AppData };

  if (!result.accepted && result.snapshot && !isAppData(result.snapshot)) {
    throw new Error('SYNC_INVALID_REMOTE_DATA');
  }

  return result;
}

function cleanForRemote(data: AppData): Omit<AppData, 'lastSyncedAt' | '_owner' | '_tombstones'> {
  const { lastSyncedAt, _owner, _tombstones, settings, ...rest } = data;
  const cleanSettings = { ...settings };
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    delete cleanSettings[key];
  }
  return { ...rest, settings: cleanSettings } as Omit<AppData, 'lastSyncedAt' | '_owner' | '_tombstones'>;
}

let channelCleanup: (() => void) | null = null;

export function subscribeToRealtime(
  userId: string,
  onRemoteChange: (data: AppData, revision: number, updatedAt: string) => void,
): () => void {
  unsubscribeRealtime();

  const supabase = getSupabaseClient();

  const channel = supabase
    .channel(`user_templates:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newRecord = payload.new as RemoteTemplate | undefined;
        if (!newRecord?.data) return;
        if (!isAppData(newRecord.data)) return;
        onRemoteChange(newRecord.data, newRecord.revision ?? 0, newRecord.updated_at);
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

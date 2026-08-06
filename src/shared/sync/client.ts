import { getSupabaseClient } from '@shared/supabase/client';
import type { AppData } from '@shared/types';
import type { RemoteTemplate } from './types';

const TABLE = 'user_templates';

export async function fetchRemote(userId: string): Promise<{ data: AppData | null; updatedAt: string | null }> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) return { data: null, updatedAt: null };

  const remoteData = (data as RemoteTemplate).data;
  if (!isAppData(remoteData)) {
    throw new Error('SYNC_INVALID_REMOTE_DATA');
  }

  return {
    data: remoteData,
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

export async function upsertRemote(userId: string, appData: AppData): Promise<string> {
  const clean = cleanForRemote(appData);

  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        data: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('updated_at')
    .single();

  if (error) throw error;
  return (data as RemoteTemplate).updated_at;
}

function cleanForRemote(data: AppData): Omit<AppData, 'lastSyncedAt' | '_owner'> {
  const { lastSyncedAt, _owner, ...rest } = data;
  return rest;
}

let channelCleanup: (() => void) | null = null;

export function subscribeToRealtime(
  userId: string,
  onRemoteChange: (data: AppData, updatedAt: string) => void,
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
        onRemoteChange(newRecord.data, newRecord.updated_at);
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

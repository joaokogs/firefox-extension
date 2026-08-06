export interface RemoteTemplate {
  user_id: string;
  data: unknown;
  updated_at: string;
  created_at: string;
}

export type SyncErrorCategory =
  | 'supabase_not_configured'
  | 'access_denied'
  | 'table_missing'
  | 'network'
  | 'unknown';

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  lastError?: string;
  lastErrorCategory?: SyncErrorCategory;
  lastSyncAt?: number;
}

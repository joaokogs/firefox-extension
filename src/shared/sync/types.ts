export interface RemoteTemplate {
  user_id: string;
  data: unknown;
  revision: number;
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
  lastPullAt?: number;
  lastSyncAt?: number;
  pendingOperations?: number;
}

export type SyncAction = 'put' | 'patch' | 'move' | 'delete';

export type SyncEntity = 'board' | 'widget' | 'link' | 'todo' | 'settings' | 'themeConfig' | 'topWidgets';

export interface SyncOperation {
  opId: string;
  baseRevision: number;
  entity: SyncEntity;
  entityId: string;
  action: SyncAction;
  payload: unknown;
  createdAt: number;
}

export interface OutboxState {
  deviceId: string;
  nextSequence: number;
  operations: SyncOperation[];
  lastKnownRevision: number;
}

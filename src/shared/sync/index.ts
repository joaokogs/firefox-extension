import { browser } from '@shared/browser';
import { getSession, subscribeAuthState } from '@shared/auth/auth';
import { hasSyncAccess } from '@shared/payments/payments';
import { loadData, saveData } from '@shared/storage';
import { supabase } from '@shared/supabase/client';
import { fetchRemote, upsertRemote, subscribeToRealtime, unsubscribeRealtime } from './client';
import { mergeAppData } from './merge';
import { migrateAppData } from './migrate';
import type { AppData } from '@shared/types';
import type { SyncState, SyncErrorCategory } from './types';
import { getDefaultData } from '@shared/types/defaults';

let state: SyncState = { status: 'idle' };
let pushQueue: AppData | null = null;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeCleanup: (() => void) | null = null;
let authUnsubscribe: (() => void) | null = null;
let stateListeners: Array<(s: SyncState) => void> = [];
let localDataProvider: (() => AppData | null) | null = null;
let remoteAppliedHandler: ((data: AppData) => void) | null = null;
let syncNowInFlight = false;
let syncChain: Promise<unknown> = Promise.resolve();
let activeFullSync: { userId: string; promise: Promise<AppData> } | null = null;
let pushRetryCount = 0;
const MAX_PUSH_RETRIES = 5;

const OWNER_STASH_KEY = 'syncOwnerData';

async function readOwnerStash(): Promise<Record<string, AppData>> {
  try {
    const result = await browser.storage.local.get(OWNER_STASH_KEY);
    return (result[OWNER_STASH_KEY] as Record<string, AppData> | undefined) ?? {};
  } catch {
    return {};
  }
}

async function writeOwnerStash(map: Record<string, AppData>): Promise<void> {
  await browser.storage.local.set({ [OWNER_STASH_KEY]: map });
}

function capStash(map: Record<string, AppData>): Record<string, AppData> {
  const keys = Object.keys(map);
  if (keys.length <= 10) return map;
  for (const key of keys.slice(0, keys.length - 10)) {
    delete map[key];
  }
  return map;
}

function setState(update: Partial<SyncState>): void {
  state = { ...state, ...update };
  for (const listener of stateListeners) {
    listener(state);
  }
}

export function getSyncState(): SyncState {
  return state;
}

export function onSyncStateChange(callback: (s: SyncState) => void): () => void {
  stateListeners.push(callback);
  return () => {
    stateListeners = stateListeners.filter((l) => l !== callback);
  };
}

export function setLocalDataProvider(provider: (() => AppData | null) | null): void {
  localDataProvider = provider;
}

export function setRemoteAppliedHandler(handler: ((data: AppData) => void) | null): void {
  remoteAppliedHandler = handler;
}

async function currentLocalData(): Promise<AppData> {
  const inMemory = localDataProvider?.();
  if (inMemory) return inMemory;
  return loadData();
}

function categorizeError(err: unknown): { message: string; category: SyncErrorCategory } {
  if (!supabase) {
    return { message: 'Sync: Supabase is not configured', category: 'supabase_not_configured' };
  }

  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string }).code ?? '';

  if (
    message.includes('JWT') ||
    message.includes('jwt') ||
    message.includes('PGRST301') ||
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return { message: 'Sync: access denied', category: 'access_denied' };
  }

  if (
    message.includes('relation') && message.includes('does not exist') ||
    message.includes('42P01') ||
    message.includes('table') && message.includes('missing')
  ) {
    return { message: 'Sync: table missing, may need migration', category: 'table_missing' };
  }

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('ECONNREFUSED')
  ) {
    return { message: 'Sync: network error', category: 'network' };
  }

  return { message: `Sync: ${err instanceof Error ? err.message : 'unknown error'}`, category: 'unknown' };
}

function sameContent(a: AppData, b: AppData): boolean {
  const aTombstones = a._tombstones;
  const bTombstones = b._tombstones;

  return (
    JSON.stringify(a.boards) === JSON.stringify(b.boards) &&
    JSON.stringify(a.settings) === JSON.stringify(b.settings) &&
    JSON.stringify(aTombstones?.deletedBoards ?? {}) === JSON.stringify(bTombstones?.deletedBoards ?? {}) &&
    JSON.stringify(aTombstones?.deletedWidgets ?? {}) === JSON.stringify(bTombstones?.deletedWidgets ?? {}) &&
    JSON.stringify(aTombstones?.deletedLinks ?? {}) === JSON.stringify(bTombstones?.deletedLinks ?? {}) &&
    JSON.stringify(aTombstones?.deletedTodos ?? {}) === JSON.stringify(bTombstones?.deletedTodos ?? {})
  );
}

async function canSync(): Promise<boolean> {
  try {
    const session = await getSession();
    if (!session?.user) return false;
    return hasSyncAccess();
  } catch {
    return false;
  }
}

async function doPull(userId: string): Promise<AppData | null> {
  const result = await fetchRemote(userId);
  if (!result.data) return null;
  return migrateAppData(result.data, parseRemoteTimestamp(result.updatedAt));
}

function doMerge(local: AppData, remote: AppData, remoteUpdatedAt?: string): AppData {
  // Realtime and older remote snapshots can arrive before the normal pull
  // migration. Normalize both sides so IDs and timestamps are always present.
  return mergeAppData(
    migrateAppData(local),
    migrateAppData(remote, parseRemoteTimestamp(remoteUpdatedAt)),
  );
}

function parseRemoteTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function doPush(userId: string, data: AppData): Promise<void> {
  await upsertRemote(userId, data);
}

function recordError(err: unknown, fallbackCategory?: SyncErrorCategory): void {
  const { message, category } = categorizeError(err);
  setState({
    status: 'error',
    lastError: message,
    lastErrorCategory: fallbackCategory ?? category,
  });
}

function logError(context: string, err: unknown): void {
  const { message } = categorizeError(err);
  console.error(`Sync: ${context}:`, message);
}

async function resolveOwnerForSync(
  local: AppData,
  userId: string,
): Promise<AppData> {
  if (!local._owner) {
    return { ...local, _owner: userId };
  }
  if (local._owner !== userId) {
    // Account switch: never merge the previous owner's local data into this
    // account. Stash it first so it can be restored when that user logs back in.
    const stash = await readOwnerStash();
    try {
      stash[local._owner] = local;
      const remote = await doPull(userId);
      if (remote) {
        await writeOwnerStash(capStash(stash));
        return { ...remote, _owner: userId };
      }
      const previous = stash[userId];
      await writeOwnerStash(capStash(stash));
      if (previous) {
        return { ...previous, _owner: userId };
      }
      const defaults = migrateAppData(getDefaultData());
      return { ...defaults, _owner: userId };
    } catch (err) {
      await writeOwnerStash(capStash(stash)).catch(() => undefined);
      const previous = stash[userId];
      if (previous) {
        return { ...previous, _owner: userId };
      }
      throw err;
    }
  }
  return local;
}

async function fullSyncCycle(userId: string, incomingLocal?: AppData): Promise<AppData> {
  // Skip duplicate cycles for the same user (e.g. initializeSync running while
  // the auth listener also fires with an INITIAL_SESSION event).
  if (activeFullSync?.userId === userId) {
    return activeFullSync.promise;
  }

  const run = async (): Promise<AppData> => {
    let local = incomingLocal ?? (await currentLocalData());
    local = migrateAppData(local);

    const remote = await doPull(userId);
    let remoteChanged = false;
    let merged: AppData;

    if (remote) {
      merged = doMerge(local, remote);
      remoteChanged = !sameContent(merged, local);
    } else {
      merged = local;
    }

    merged = { ...merged, _owner: userId };

    // Re-incorporate edits made while the network round-trip was in flight:
    // otherwise the cycle applies (and pushes) a stale snapshot and clobbers
    // concurrent local edits through saveData / remoteAppliedHandler.
    const live = await currentLocalData();
    if (live && !sameContent(live, local)) {
      merged = doMerge(merged, migrateAppData(live));
      merged = { ...merged, _owner: userId };
    }

    await saveData(merged);
    if (remoteChanged) {
      setState({ lastPullAt: Date.now() });
    }
    remoteAppliedHandler?.(merged);

    if (remote) {
      if (!sameContent(merged, remote)) {
        await doPush(userId, merged);
      }
    } else {
      await doPush(userId, merged);
    }

    return merged;
  };

  // Serialize cycles so concurrent runs for different accounts cannot
  // overwrite each other's local snapshot (last-writer-wins on shared storage).
  const promise = syncChain.then(run, run);
  syncChain = promise.then(() => undefined, () => undefined);
  activeFullSync = { userId, promise };
  try {
    return await promise;
  } finally {
    if (activeFullSync?.promise === promise) {
      activeFullSync = null;
    }
  }
}

export function syncNow(): void {
  if (syncNowInFlight) return;

  syncNowInFlight = true;
  setState({ status: 'syncing' });

  (async () => {
    try {
      if (!supabase) {
        setState({ status: 'idle' });
        return;
      }

      const can = await canSync();
      if (!can) {
        setState({ status: 'idle' });
        return;
      }

      const session = await getSession();
      if (!session?.user) {
        setState({ status: 'idle' });
        return;
      }

      const userId = session.user.id;

      let local = await currentLocalData();
      local = await resolveOwnerForSync(local, userId);

      startRealtime(userId);

      const merged = await fullSyncCycle(userId, local);

      setState({ status: 'idle', lastSyncAt: Date.now() });

      if (!sameContent(merged, local)) {
        remoteAppliedHandler?.(merged);
      }
    } catch (err) {
      recordError(err);
    } finally {
      syncNowInFlight = false;
    }
  })();
}

export async function initializeSync(initialData?: AppData): Promise<AppData> {
  let local = initialData ?? (await loadData());
  local = migrateAppData(local);

  if (!supabase) {
    setState({ status: 'idle' });
    return local;
  }

  startAuthListener();

  const can = await canSync();
  if (!can) {
    setState({ status: 'idle' });
    return local;
  }

  setState({ status: 'syncing' });

  try {
    const session = await getSession();
    if (!session?.user) {
      setState({ status: 'idle' });
      return local;
    }

    const userId = session.user.id;

    local = await resolveOwnerForSync(local, userId);

    startRealtime(userId);

    local = await fullSyncCycle(userId, local);

    setState({ status: 'idle', lastSyncAt: Date.now() });
    return local;
  } catch (err) {
    recordError(err);
    return local;
  }
}

export function queuePush(data: AppData): void {
  pushQueue = data;

  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
  }

  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    void flushPushQueue();
  }, 2000);
}

async function flushPushQueue(): Promise<void> {
  const data = pushQueue;
  pushQueue = null;
  if (!data) return;

  try {
    const can = await canSync();
    if (!can) return;

    const session = await getSession();
    if (!session?.user) return;

    const fresh = await currentLocalData();
    // Only push data already claimed by this account. Unclaimed (visitor) or
    // other-owner data must go through a sync cycle so it is merged first —
    // a raw upsert here could overwrite the account's remote layout.
    if (fresh._owner !== session.user.id) {
      pushRetryCount = 0;
      return;
    }
    await doPush(session.user.id, fresh);
    pushRetryCount = 0;
    setState({ status: 'idle', lastSyncAt: Date.now() });
  } catch (err) {
    logError('push failed', err);
    pushRetryCount += 1;
    if (pushRetryCount <= MAX_PUSH_RETRIES) {
      queuePush(data);
    } else {
      pushRetryCount = 0;
    }
  }
}

async function handleRemoteChange(userId: string, remote: AppData, remoteUpdatedAt?: string): Promise<void> {
  try {
    const session = await getSession();
    if (!session?.user || session.user.id !== userId) return;

    const local = await currentLocalData();
    if (local._owner && local._owner !== userId) return;

    const merged = doMerge(local, remote, remoteUpdatedAt);
    if (sameContent(merged, local)) return;
    await saveData(merged);
    remoteAppliedHandler?.(merged);
    if (!sameContent(merged, remote)) {
        if (session?.user && (!merged._owner || merged._owner === session.user.id)) {
          await doPush(session.user.id, merged);
      }
    }
    const syncedAt = Date.now();
    setState({ lastPullAt: syncedAt, lastSyncAt: syncedAt });
  } catch (err) {
    logError('failed to apply remote change', err);
  }
}

function startRealtime(userId: string): void {
  try {
    realtimeCleanup = subscribeToRealtime(userId, (remote, remoteUpdatedAt) => {
      void handleRemoteChange(userId, remote, remoteUpdatedAt);
    });
  } catch {
    // Realtime not available, fall back to pull-based sync
  }
}

function startAuthListener(): void {
  if (authUnsubscribe || !supabase) return;

  authUnsubscribe = subscribeAuthState(async (session, event) => {
    if (event === 'SIGNED_OUT') {
      if (realtimeCleanup) {
        realtimeCleanup();
        realtimeCleanup = null;
      }
      return;
    }

    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return;

    if (session?.user) {
      const can = await canSync();
      if (can) {
        try {
          const userId = session.user.id;

          let local = await currentLocalData();
          local = await resolveOwnerForSync(local, userId);

          const merged = await fullSyncCycle(userId, local);

          if (!sameContent(merged, local)) {
            remoteAppliedHandler?.(merged);
          }

          startRealtime(userId);
        } catch (err) {
          logError('auth change failed', err);
        }
      }
    }
  });
}

export async function syncOnOnline(): Promise<void> {
  const can = await canSync();
  if (!can) return;

  setState({ status: 'syncing' });

  try {
    const session = await getSession();
    if (!session?.user) return;

    const userId = session.user.id;

    let local = await currentLocalData();
    local = await resolveOwnerForSync(local, userId);

    const merged = await fullSyncCycle(userId, local);

    if (!sameContent(merged, local)) {
      remoteAppliedHandler?.(merged);
    }

    setState({ status: 'idle', lastSyncAt: Date.now() });
  } catch (err) {
    recordError(err);
  }
}

export function setupOnlineListener(): () => void {
  const handler = () => {
    if (navigator.onLine) {
      void syncOnOnline();
    } else {
      setState({ status: 'offline' });
    }
  };

  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);

  if (!navigator.onLine) {
    setState({ status: 'offline' });
  }

  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}

export function cleanup(): void {
  if (pushDebounceTimer) {
    clearTimeout(pushDebounceTimer);
    pushDebounceTimer = null;
  }
  if (realtimeCleanup) {
    realtimeCleanup();
    realtimeCleanup = null;
  }
  if (authUnsubscribe) {
    authUnsubscribe();
    authUnsubscribe = null;
  }
  unsubscribeRealtime();
  localDataProvider = null;
  remoteAppliedHandler = null;
  syncNowInFlight = false;
  pushQueue = null;
  pushRetryCount = 0;
  setState({ status: 'idle' });
}

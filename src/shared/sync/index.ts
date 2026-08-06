import { browser } from '@shared/browser';
import { getSession, subscribeAuthState } from '@shared/auth/auth';
import { hasSyncAccess } from '@shared/payments/payments';
import { loadData, saveData } from '@shared/storage';
import { supabase } from '@shared/supabase/client';
import {
  fetchRemote,
  pushSnapshotWithRevision,
  subscribeToRealtime,
  unsubscribeRealtime,
} from './client';
import { migrateAppData } from './migrate';
import type { AppData, AppSettings } from '@shared/types';
import { LOCAL_ONLY_SETTINGS_KEYS } from '@shared/types/constants';
import type { SyncState, SyncErrorCategory, SyncOperation } from './types';
import { getDefaultData } from '@shared/types/defaults';
import {
  getPendingOperations,
  updateLastKnownRevision,
  getLastKnownRevision,
  getPendingCount,
  ackOperations,
  setOutboxOwner,
  claimAndMergeOutbox,
} from './outbox';

let state: SyncState = { status: 'idle' };
let realtimeCleanup: (() => void) | null = null;
let authUnsubscribe: (() => void) | null = null;
let stateListeners: Array<(s: SyncState) => void> = [];
let localDataProvider: (() => AppData | null) | null = null;
let remoteAppliedHandler: ((data: AppData) => void) | null = null;
let syncNowInFlight = false;
let syncChain: Promise<unknown> = Promise.resolve();
let activeFullSync: { userId: string; promise: Promise<AppData> } | null = null;
let currentOwner: string | undefined;

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
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('42P01') ||
    (message.includes('table') && message.includes('missing'))
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

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (val as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return val;
  });
}

function syncSettingsDigest(settings: AppSettings): string {
  const clean = { ...settings };
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    delete clean[key];
  }
  return stableStringify(clean);
}

function sameContent(a: AppData, b: AppData): boolean {
  return (
    stableStringify(a.boards) === stableStringify(b.boards) &&
    syncSettingsDigest(a.settings) === syncSettingsDigest(b.settings)
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
    currentOwner = userId;
    setOutboxOwner(userId);
    await claimAndMergeOutbox(userId);
    return { ...local, _owner: userId };
  }
  if (local._owner !== userId) {
    const previousOwner = currentOwner;
    currentOwner = userId;
    setOutboxOwner(userId);

    const stash = await readOwnerStash();
    try {
      stash[local._owner] = local;
      const remote = await fetchRemote(userId);
      if (remote.data) {
        await updateLastKnownRevision(remote.revision, userId);
        await writeOwnerStash(capStash(stash));
        return { ...remote.data, _owner: userId };
      }
      const previous = stash[userId];
      await writeOwnerStash(capStash(stash));
      if (previous) {
        return { ...previous, _owner: userId };
      }
      const defaults = migrateAppData(getDefaultData());
      return { ...defaults, _owner: userId };
    } catch (err) {
      currentOwner = previousOwner;
      setOutboxOwner(previousOwner);
      await writeOwnerStash(capStash(stash)).catch(() => undefined);
      const previous = stash[userId];
      if (previous) {
        return { ...previous, _owner: userId };
      }
      throw err;
    }
  }
  currentOwner = userId;
  setOutboxOwner(userId);
  await claimAndMergeOutbox(userId);
  return local;
}

function preserveLocalOnly(merged: AppData, source: AppData): AppData {
  const result = { ...merged, settings: { ...merged.settings } };
  for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
    if (key in source.settings) {
      (result.settings as Record<string, unknown>)[key] = source.settings[key];
    }
  }
  return result;
}

type ApplyResult = {
  data: AppData;
  unapplied: SyncOperation[];
  appliedOpIds: Set<string>;
};

function applyOperationsToData(base: AppData, operations: SyncOperation[]): ApplyResult {
  let data = structuredClone(base);
  const unapplied: SyncOperation[] = [];
  const appliedOpIds = new Set<string>();

  for (const op of operations) {
    try {
      const result = applySingleOperation(data, op);
      if (result) {
        data = result;
        appliedOpIds.add(op.opId);
      } else {
        unapplied.push(op);
      }
    } catch {
      unapplied.push(op);
    }
  }

  return { data, unapplied, appliedOpIds };
}

function applySingleOperation(data: AppData, op: SyncOperation): AppData | null {
  switch (op.entity) {
    case 'board': return applyBoardOp(data, op);
    case 'widget': return applyWidgetOp(data, op);
    case 'link': return applyLinkOp(data, op);
    case 'todo': return applyTodoOp(data, op);
    case 'settings': return applySettingsOp(data, op);
    case 'themeConfig': return applyThemeConfigOp(data, op);
    case 'topWidgets': return applyTopWidgetsOp(data, op);
    default: return null;
  }
}

function applyBoardOp(data: AppData, op: SyncOperation): AppData | null {
  const boardId = op.entityId;
  if (op.action === 'put') {
    const board = op.payload as AppData['boards'][number];
    const existing = data.boards.findIndex((b) => b.id === boardId);
    if (existing >= 0) {
      const boards = [...data.boards];
      boards[existing] = { ...board, updatedAt: Date.now() };
      return { ...data, boards };
    }
    return { ...data, boards: [...data.boards, { ...board, updatedAt: Date.now() }] };
  }
  if (op.action === 'patch') {
    const idx = data.boards.findIndex((b) => b.id === boardId);
    if (idx < 0) return null;
    const boards = [...data.boards];
    boards[idx] = { ...boards[idx], ...(op.payload as object), updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'delete') {
    const idx = data.boards.findIndex((b) => b.id === boardId);
    if (idx < 0) return data;
    const boards = data.boards.filter((b) => b.id !== boardId);
    return { ...data, boards, settings: { ...data.settings, lastBoardId: boards[0]?.id } };
  }
  if (op.action === 'move') {
    const { toIndex } = op.payload as { toIndex: number };
    const idx = data.boards.findIndex((b) => b.id === boardId);
    if (idx < 0) return null;
    const clamped = Math.max(0, Math.min(toIndex, data.boards.length - 1));
    if (idx === clamped) return data;
    const boards = [...data.boards];
    const [moved] = boards.splice(idx, 1);
    boards.splice(clamped, 0, moved);
    return { ...data, boards };
  }
  return null;
}

// --- widget/link/todo/settings/themeConfig/topWidgets apply functions unchanged ---

function applyWidgetOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const boardId = parts[0];
  const widgetId = parts[1];
  const boardIdx = data.boards.findIndex((b) => b.id === boardId);
  if (boardIdx < 0) return null;
  const board = data.boards[boardIdx];

  if (op.action === 'put') {
    const widget = op.payload as AppData['boards'][number]['widgets'][number];
    const existingIdx = board.widgets.findIndex((w) => w.id === widgetId);
    const widgets = [...board.widgets];
    if (existingIdx >= 0) {
      widgets[existingIdx] = { ...widget, updatedAt: Date.now() };
    } else {
      widgets.push({ ...widget, updatedAt: Date.now() });
    }
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'patch') {
    const wIdx = board.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return null;
    const widgets = [...board.widgets];
    widgets[wIdx] = { ...widgets[wIdx], ...(op.payload as object), updatedAt: Date.now() };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'delete') {
    const wIdx = board.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return data;
    const widgets = board.widgets.filter((w) => w.id !== widgetId);
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'move') {
    const { toIndex, col, layoutColumns } = op.payload as { toIndex: number; col?: number; layoutColumns?: number };
    const wIdx = board.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return null;
    const widgets = [...board.widgets];
    widgets[wIdx] = { ...widgets[wIdx], order: toIndex, updatedAt: Date.now() };
    if (col !== undefined) (widgets[wIdx] as unknown as Record<string, unknown>).col = col;
    if (layoutColumns !== undefined) (widgets[wIdx] as unknown as Record<string, unknown>).layoutColumns = layoutColumns;
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  return null;
}

function applyLinkOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const boardId = parts[0];
  const widgetId = parts[1];
  const linkId = parts[2];
  const boardIdx = data.boards.findIndex((b) => b.id === boardId);
  if (boardIdx < 0) return null;
  const board = data.boards[boardIdx];
  const widgetIdx = board.widgets.findIndex((w) => w.id === widgetId);
  if (widgetIdx < 0) return null;
  const widget = board.widgets[widgetIdx];
  if (widget.type !== 'links') return null;

  if (op.action === 'put') {
    const link = op.payload as Record<string, unknown>;
    const existingIdx = widget.items.findIndex((l) => l.id === linkId);
    const items = [...widget.items];
    if (existingIdx >= 0) {
      items[existingIdx] = { ...link, id: linkId, createdAt: (link.createdAt as number) ?? Date.now(), updatedAt: Date.now() } as typeof widget.items[number];
    } else {
      items.push({ ...link, id: linkId, createdAt: (link.createdAt as number) ?? Date.now(), updatedAt: Date.now() } as typeof widget.items[number]);
    }
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'patch') {
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return null;
    const items = [...widget.items];
    items[lIdx] = { ...items[lIdx], ...(op.payload as object), updatedAt: Date.now() };
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'delete') {
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return data;
    const items = widget.items.filter((l) => l.id !== linkId);
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'move') {
    const { toWidgetId, toIndex } = op.payload as { toWidgetId: string; toIndex: number };
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return null;
    const link = widget.items[lIdx];

    let boards = [...data.boards];
    const sourceWidgets = [...board.widgets];
    const sourceWidget = sourceWidgets[widgetIdx];
    if (sourceWidget.type !== 'links') return null;
    sourceWidgets[widgetIdx] = { ...sourceWidget, items: sourceWidget.items.filter((l) => l.id !== linkId) };
    boards[boardIdx] = { ...board, widgets: sourceWidgets, updatedAt: Date.now() };

    const targetWIdx = boards[boardIdx].widgets.findIndex((w) => w.id === toWidgetId);
    if (targetWIdx < 0) return null;
    const targetWidget = boards[boardIdx].widgets[targetWIdx];
    if (targetWidget.type !== 'links') return null;
    const targetItems = [...targetWidget.items];
    targetItems.splice(Math.min(toIndex, targetItems.length), 0, link);
    const finalWidgets = [...boards[boardIdx].widgets];
    finalWidgets[targetWIdx] = { ...targetWidget, items: targetItems };

    const finalBoards = [...data.boards];
    finalBoards[boardIdx] = { ...boards[boardIdx], widgets: finalWidgets, updatedAt: Date.now() };
    return { ...data, boards: finalBoards };
  }
  return null;
}

function applyTodoOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const boardId = parts[0];
  const widgetId = parts[1];
  const todoId = parts[2];
  const boardIdx = data.boards.findIndex((b) => b.id === boardId);
  if (boardIdx < 0) return null;
  const board = data.boards[boardIdx];
  const widgetIdx = board.widgets.findIndex((w) => w.id === widgetId);
  if (widgetIdx < 0) return null;
  const widget = board.widgets[widgetIdx];
  if (widget.type !== 'todo') return null;

  if (op.action === 'put') {
    const todo = op.payload as Record<string, unknown>;
    const existingIdx = widget.items.findIndex((t) => t.id === todoId);
    const items = [...widget.items];
    if (existingIdx >= 0) {
      items[existingIdx] = { ...todo, id: todoId, createdAt: (todo.createdAt as number) ?? Date.now(), updatedAt: Date.now() } as typeof widget.items[number];
    } else {
      items.push({ ...todo, id: todoId, createdAt: (todo.createdAt as number) ?? Date.now(), updatedAt: Date.now() } as typeof widget.items[number]);
    }
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'patch') {
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return null;
    const items = [...widget.items];
    items[tIdx] = { ...items[tIdx], ...(op.payload as object), updatedAt: Date.now() };
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'delete') {
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return data;
    const items = widget.items.filter((t) => t.id !== todoId);
    const widgets = [...board.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const boards = [...data.boards];
    boards[boardIdx] = { ...board, widgets, updatedAt: Date.now() };
    return { ...data, boards };
  }
  if (op.action === 'move') {
    const { toWidgetId, toIndex } = op.payload as { toWidgetId: string; toIndex: number };
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return null;
    const todo = widget.items[tIdx];

    let boards = [...data.boards];
    const sourceWidgets = [...board.widgets];
    const sourceWidget = sourceWidgets[widgetIdx];
    if (sourceWidget.type !== 'todo') return null;
    sourceWidgets[widgetIdx] = { ...sourceWidget, items: sourceWidget.items.filter((t) => t.id !== todoId) };
    boards[boardIdx] = { ...board, widgets: sourceWidgets, updatedAt: Date.now() };

    const targetWIdx = boards[boardIdx].widgets.findIndex((w) => w.id === toWidgetId);
    if (targetWIdx < 0) return null;
    const targetWidget = boards[boardIdx].widgets[targetWIdx];
    if (targetWidget.type !== 'todo') return null;
    const targetItems = [...targetWidget.items];
    targetItems.splice(Math.min(toIndex, targetItems.length), 0, todo);
    const finalWidgets = [...boards[boardIdx].widgets];
    finalWidgets[targetWIdx] = { ...targetWidget, items: targetItems };

    const finalBoards = [...data.boards];
    finalBoards[boardIdx] = { ...boards[boardIdx], widgets: finalWidgets, updatedAt: Date.now() };
    return { ...data, boards: finalBoards };
  }
  return null;
}

function applySettingsOp(data: AppData, op: SyncOperation): AppData | null {
  if (op.action === 'put' || op.action === 'patch') {
    const payload = op.payload as Partial<AppSettings>;
    const syncPayload: Partial<AppSettings> = { ...payload };
    for (const key of LOCAL_ONLY_SETTINGS_KEYS) {
      delete syncPayload[key];
    }
    if (Object.keys(syncPayload).length === 0) return data;
    return { ...data, settings: { ...data.settings, ...syncPayload }, settingsUpdatedAt: Date.now() };
  }
  return null;
}

function applyThemeConfigOp(data: AppData, op: SyncOperation): AppData | null {
  if (op.action === 'put' || op.action === 'patch') {
    return { ...data, settings: { ...data.settings, themeConfig: op.payload as AppSettings['themeConfig'] }, settingsUpdatedAt: Date.now() };
  }
  return null;
}

function applyTopWidgetsOp(data: AppData, op: SyncOperation): AppData | null {
  if (op.action === 'put' || op.action === 'patch') {
    return { ...data, settings: { ...data.settings, topWidgets: op.payload as AppSettings['topWidgets'] }, settingsUpdatedAt: Date.now() };
  }
  return null;
}

async function pushAndAck(
  userId: string,
  data: AppData,
  baseRevision: number,
  appliedOpIds: Set<string>,
): Promise<{ accepted: boolean; revision: number }> {
  const pushResult = await pushSnapshotWithRevision(userId, data, baseRevision);
  if (pushResult.accepted) {
    if (appliedOpIds.size > 0) {
      await ackOperations(appliedOpIds, pushResult.revision, userId);
    }
    setState({ lastSyncAt: Date.now() });
  }
  return { accepted: pushResult.accepted, revision: pushResult.revision };
}

async function applyNewOperationsAfterPush(
  userId: string,
  merged: AppData,
): Promise<AppData> {
  const live = await currentLocalData();
  const freshOps = await getPendingOperations(userId);
  if (freshOps.length === 0) return preserveLocalOnly(merged, live);
  const applied = applyOperationsToData(merged, freshOps);
  return preserveLocalOnly(applied.data, live);
}

async function revisionSyncCycle(userId: string, incomingLocal?: AppData): Promise<AppData> {
  if (activeFullSync?.userId === userId) {
    return activeFullSync.promise;
  }

  const run = async (): Promise<AppData> => {
    let local = incomingLocal ?? (await currentLocalData());
    local = migrateAppData(local);

    const knownRevision = await getLastKnownRevision(userId);
    const pendingOps = await getPendingOperations(userId);
    const remote = await fetchRemote(userId);

    let merged: AppData;

    if (remote.data) {
      const remoteRevision = remote.revision;
      let appliedOpIds = new Set<string>();

      if (pendingOps.length > 0) {
        const applied = applyOperationsToData(remote.data, pendingOps);
        merged = applied.data;
        appliedOpIds = applied.appliedOpIds;
      } else {
        merged = { ...remote.data };
      }
      merged = { ...merged, _owner: userId };
      merged = preserveLocalOnly(merged, await currentLocalData() ?? local);

      await updateLastKnownRevision(remoteRevision, userId);

      const shouldPush = appliedOpIds.size > 0 || !sameContent(merged, remote.data);

      if (shouldPush) {
        try {
          const result = await pushAndAck(userId, merged, remoteRevision, appliedOpIds);
          if (!result.accepted) {
            const freshRemote = await fetchRemote(userId);
            if (freshRemote.data) {
              const freshOps = await getPendingOperations(userId);
              const rebased = applyOperationsToData(freshRemote.data, freshOps);
              merged = rebased.data;
              merged = { ...merged, _owner: userId };
              merged = preserveLocalOnly(merged, await currentLocalData() ?? local);
              await updateLastKnownRevision(freshRemote.revision, userId);
              const retryResult = await pushAndAck(userId, merged, freshRemote.revision, rebased.appliedOpIds);
              if (!retryResult.accepted) {
                logError('revisionSyncCycle', new Error('Second retry also stale — keeping outbox, will retry later'));
              }
            }
          }
        } catch {
          // Push failed, outbox preserved for next sync
        }
      }

      merged = await applyNewOperationsAfterPush(userId, merged);
      await saveData(merged);
      if (remoteRevision > knownRevision) {
        setState({ lastPullAt: Date.now() });
      }
      remoteAppliedHandler?.(merged);
    } else {
      // No remote data
      if (pendingOps.length > 0) {
        const applied = applyOperationsToData(local, pendingOps);
        merged = applied.data;
        const appliedOpIds = applied.appliedOpIds;
        merged = { ...merged, _owner: userId };

        if (appliedOpIds.size > 0) {
          try {
            await pushAndAck(userId, merged, 0, appliedOpIds);
          } catch {
            // Will retry on next sync
          }
        }

        merged = await applyNewOperationsAfterPush(userId, merged);
        await saveData(merged);
      } else {
        // Nothing to sync — push initial snapshot so account has data
        merged = { ...local, _owner: userId };
        try {
          await pushAndAck(userId, merged, 0, new Set());
        } catch {
          // Initial push can wait
        }
        await saveData(merged);
      }
    }

    await updatePendingCount();
    return merged;
  };

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

async function updatePendingCount(): Promise<void> {
  const count = await getPendingCount(currentOwner);
  setState({ pendingOperations: count });
}

async function drainOutbox(userId: string): Promise<void> {
  setState({ status: 'syncing' });
  try {
    await updatePendingCount();
    await revisionSyncCycle(userId);
    setState({ status: 'idle' });
  } catch (err) {
    recordError(err);
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
        await updatePendingCount();
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

      await drainOutbox(userId);
      setState({ status: 'idle', lastSyncAt: Date.now() });
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
    await updatePendingCount();
    return local;
  }

  startAuthListener();

  const can = await canSync();
  if (!can) {
    setState({ status: 'idle' });
    await updatePendingCount();
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

    local = await revisionSyncCycle(userId, local);

    setState({ status: 'idle', lastSyncAt: Date.now() });
    await updatePendingCount();
    return local;
  } catch (err) {
    recordError(err);
    await updatePendingCount();
    return local;
  }
}

export function notifyLocalMutation(): void {
  updatePendingCount().catch(() => undefined);
}

async function handleRemoteChange(userId: string, remote: AppData, remoteRevision: number, _remoteUpdatedAt?: string): Promise<void> {
  try {
    const session = await getSession();
    if (!session?.user || session.user.id !== userId) return;

    const can = await canSync();
    if (!can) return;

    const local = await currentLocalData();
    if (local._owner && local._owner !== userId) return;

    const pendingOps = await getPendingOperations(userId);
    let merged: AppData;

    if (pendingOps.length > 0) {
      const applied = applyOperationsToData(remote, pendingOps);
      merged = applied.data;
    } else {
      merged = { ...remote };
    }

    merged = { ...merged, _owner: userId };
    merged = preserveLocalOnly(merged, await currentLocalData() ?? local);

    if (sameContent(merged, local)) return;

    await updateLastKnownRevision(remoteRevision, userId);
    await saveData(merged);
    remoteAppliedHandler?.(merged);

    const syncedAt = Date.now();
    setState({ lastPullAt: syncedAt, lastSyncAt: syncedAt });
  } catch (err) {
    logError('failed to apply remote change', err);
  }
}

function startRealtime(userId: string): void {
  try {
    realtimeCleanup = subscribeToRealtime(userId, (remote, revision, updatedAt) => {
      void handleRemoteChange(userId, remote, revision, updatedAt);
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

          startRealtime(userId);

          await drainOutbox(userId);
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

    await drainOutbox(userId);

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
  currentOwner = undefined;
  setOutboxOwner(undefined);
  setState({ status: 'idle' });
}

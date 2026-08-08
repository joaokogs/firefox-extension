import { browser } from '@shared/browser';
import { getSession, subscribeAuthState } from '@shared/auth/auth';
import { hasSyncAccess } from '@shared/payments/payments';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { loadData, saveData, onStorageFailure, loadSyncMeta, saveSyncMeta } from '@shared/storage';
import { supabase } from '@shared/supabase/client';
import {
  fetchRemoteWorkspaces,
  fetchRemotePreferences,
  pushWorkspace,
  pushPreferences,
  subscribeToRealtime,
  unsubscribeRealtime,
} from './client';
import { migrateAppData } from './migrate';
import type { AppData, AppSettings, SyncMeta, Workspace, Widget } from '@shared/types';
import { LOCAL_ONLY_SETTINGS_KEYS } from '@shared/types/constants';
import type { SyncState, SyncErrorCategory, SyncOperation } from './types';
import {
  getPendingOperations,
  getPendingCount,
  ackOperations,
  setOutboxOwner,
  claimAndMergeOutbox,
  classifyDeadLetters,
  getDeadLetterCount,
  markOperationsCommitted,
  requeueDeadLetters,
  clearCommittedInMemory,
} from './outbox';
import { mergeAppData, purgeConfirmedDeletedWorkspaces } from './merge';
import { acquireSyncLease } from './coordinator';

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
let storageFailureUnsubscribe: (() => void) | null = null;
let localMutationTimer: ReturnType<typeof setTimeout> | null = null;
let remoteChangeTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 1_000;

const OWNER_STASH_KEY = 'syncOwnerData';
const MAX_OWNER_STASH = 10;

interface OwnerStashMeta {
  data: AppData;
  savedAt: number;
}

type OwnerStashRaw = Record<string, AppData | OwnerStashMeta>;

function isStashMeta(entry: AppData | OwnerStashMeta): entry is OwnerStashMeta {
  return typeof entry === 'object' && entry !== null && 'savedAt' in entry && 'data' in entry;
}

async function readOwnerStash(): Promise<Record<string, OwnerStashMeta>> {
  try {
    const result = await browser.storage.local.get(OWNER_STASH_KEY);
    const raw = (result[OWNER_STASH_KEY] as OwnerStashRaw | undefined) ?? {};
    const migrated: Record<string, OwnerStashMeta> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (isStashMeta(value)) {
        migrated[key] = value;
      } else {
        migrated[key] = { data: value as AppData, savedAt: 0 };
      }
    }
    return migrated;
  } catch {
    return {};
  }
}

async function writeOwnerStash(map: Record<string, OwnerStashMeta>): Promise<void> {
  await browser.storage.local.set({ [OWNER_STASH_KEY]: map });
}

function capStash(map: Record<string, OwnerStashMeta>): Record<string, OwnerStashMeta> {
  const entries = Object.entries(map);
  if (entries.length <= MAX_OWNER_STASH) return map;

  entries.sort((a, b) => b[1].savedAt - a[1].savedAt);

  const result: Record<string, OwnerStashMeta> = {};
  for (const [key, value] of entries.slice(0, MAX_OWNER_STASH)) {
    result[key] = value;
  }
  return result;
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
    stableStringify(a.workspaces) === stableStringify(b.workspaces) &&
    syncSettingsDigest(a.settings) === syncSettingsDigest(b.settings)
  );
}

async function canSync(): Promise<boolean> {
  const session = await withSyncTimeout(() => getSession());
  if (!session?.user) return false;
  return await withSyncTimeout(() => hasSyncAccess());
}

function recordError(err: unknown, fallbackCategory?: SyncErrorCategory): void {
  const { message, category } = categorizeError(err);
  console.error('Sync:', message);
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

function withSyncTimeout<T>(operation: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Sync timeout'));
    }, SYNC_TIMEOUT_MS);

    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

async function resolveOwnerForSync(
  local: AppData,
  userId: string,
): Promise<AppData> {
  const meta = await loadSyncMeta();
  if (!meta.owner) {
    currentOwner = userId;
    setOutboxOwner(userId);
    await claimAndMergeOutbox(userId);
    await saveSyncMeta({ ...meta, owner: userId });
    return local;
  }
  if (meta.owner !== userId) {
    currentOwner = userId;
    setOutboxOwner(userId);

    const stash = await readOwnerStash();
    try {
      stash[meta.owner] = { data: local, savedAt: Date.now() };
      const previous = stash[userId];
      await writeOwnerStash(capStash(stash));
      await claimAndMergeOutbox(userId);
      const restored = previous
        ? mergeAppData(migrateAppData(local), migrateAppData(previous.data))
        : local;
      await saveSyncMeta({ ...meta, owner: userId });
      return restored;
    } catch (err) {
      await writeOwnerStash(capStash(stash)).catch(() => undefined);
      const previous = stash[userId];
      if (previous) {
        const restored = mergeAppData(migrateAppData(local), migrateAppData(previous.data));
        await saveSyncMeta({ ...meta, owner: userId });
        return restored;
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
    case 'board': return applyWorkspaceOp(data, op);
    case 'widget': return applyWidgetOp(data, op);
    case 'link': return applyLinkOp(data, op);
    case 'todo': return applyTodoOp(data, op);
    case 'settings': return applySettingsOp(data, op);
    case 'themeConfig': return applyThemeConfigOp(data, op);
    case 'topWidgets': return applyTopWidgetsOp(data, op);
    default: return null;
  }
}

function applyWorkspaceOp(data: AppData, op: SyncOperation): AppData | null {
  const workspaceId = op.entityId;
  if (op.action === 'put') {
    const workspace = op.payload as Workspace;
    const existing = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (existing >= 0) {
      const workspaces = [...data.workspaces];
      workspaces[existing] = {
        ...workspaces[existing],
        ...workspace,
        position: workspace.position ?? workspaces[existing].position,
        updatedAt: Date.now(),
      };
      return { ...data, workspaces };
    }
    return {
      ...data,
      workspaces: [...data.workspaces, { ...workspace, position: workspace.position ?? data.workspaces.length, updatedAt: Date.now() }],
    };
  }
  if (op.action === 'patch') {
    const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx < 0) return null;
    const workspaces = [...data.workspaces];
    workspaces[idx] = { ...workspaces[idx], ...(op.payload as object), updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'delete') {
    const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx < 0) return data;
    const deletedAt = Date.now();
    const workspaces = [...data.workspaces];
    workspaces[idx] = { ...workspaces[idx], deletedAt, updatedAt: deletedAt };
    const visible = workspaces.filter((workspace) => !workspace.deletedAt);
    return { ...data, workspaces, settings: { ...data.settings, lastBoardId: visible[0]?.id } };
  }
  if (op.action === 'move') {
    const { toIndex } = op.payload as { toIndex: number };
    const idx = data.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx < 0) return null;
    const clamped = Math.max(0, Math.min(toIndex, data.workspaces.length - 1));
    if (idx === clamped) return data;
    const workspaces = [...data.workspaces];
    const [moved] = workspaces.splice(idx, 1);
    workspaces.splice(clamped, 0, moved);
    return {
      ...data,
      workspaces: workspaces.map((workspace, position) => ({ ...workspace, position })),
    };
  }
  return null;
}

function applyWidgetOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const workspaceId = parts[0];
  const widgetId = parts[1];
  const workspaceIdx = data.workspaces.findIndex((w) => w.id === workspaceId);
  if (workspaceIdx < 0) return null;
  const workspace = data.workspaces[workspaceIdx];

  if (op.action === 'put') {
    const widget = op.payload as Widget;
    const existingIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
    const widgets = [...workspace.widgets];
    if (existingIdx >= 0) {
      widgets[existingIdx] = { ...widget, updatedAt: Date.now() };
    } else {
      widgets.push({ ...widget, updatedAt: Date.now() });
    }
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'patch') {
    const wIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return null;
    const widgets = [...workspace.widgets];
    widgets[wIdx] = { ...widgets[wIdx], ...(op.payload as object), updatedAt: Date.now() };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'delete') {
    const wIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return data;
    const widgets = workspace.widgets.filter((w) => w.id !== widgetId);
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'move') {
    const { toIndex, col, layoutColumns } = op.payload as { toIndex: number; col?: number; layoutColumns?: number };
    const wIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
    if (wIdx < 0) return null;
    const widgets = [...workspace.widgets];
    widgets[wIdx] = { ...widgets[wIdx], order: toIndex, updatedAt: Date.now() };
    if (col !== undefined) (widgets[wIdx] as unknown as Record<string, unknown>).col = col;
    if (layoutColumns !== undefined) (widgets[wIdx] as unknown as Record<string, unknown>).layoutColumns = layoutColumns;
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  return null;
}

function applyLinkOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const workspaceId = parts[0];
  const widgetId = parts[1];
  const linkId = parts[2];
  const workspaceIdx = data.workspaces.findIndex((w) => w.id === workspaceId);
  if (workspaceIdx < 0) return null;
  const workspace = data.workspaces[workspaceIdx];
  const widgetIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
  if (widgetIdx < 0) return null;
  const widget = workspace.widgets[widgetIdx];
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
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'patch') {
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return null;
    const items = [...widget.items];
    items[lIdx] = { ...items[lIdx], ...(op.payload as object), updatedAt: Date.now() };
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'delete') {
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return data;
    const items = widget.items.filter((l) => l.id !== linkId);
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'move') {
    const { toWidgetId, toIndex } = op.payload as { toWidgetId: string; toIndex: number };
    const lIdx = widget.items.findIndex((l) => l.id === linkId);
    if (lIdx < 0) return null;
    const link = widget.items[lIdx];

    let workspaces = [...data.workspaces];
    const sourceWidgets = [...workspace.widgets];
    const sourceWidget = sourceWidgets[widgetIdx];
    if (sourceWidget.type !== 'links') return null;
    sourceWidgets[widgetIdx] = { ...sourceWidget, items: sourceWidget.items.filter((l) => l.id !== linkId) };
    workspaces[workspaceIdx] = { ...workspace, widgets: sourceWidgets, updatedAt: Date.now() };

    const targetWIdx = workspaces[workspaceIdx].widgets.findIndex((w) => w.id === toWidgetId);
    if (targetWIdx < 0) return null;
    const targetWidget = workspaces[workspaceIdx].widgets[targetWIdx];
    if (targetWidget.type !== 'links') return null;
    const targetItems = [...targetWidget.items];
    targetItems.splice(Math.min(toIndex, targetItems.length), 0, link);
    const finalWidgets = [...workspaces[workspaceIdx].widgets];
    finalWidgets[targetWIdx] = { ...targetWidget, items: targetItems };

    const finalWorkspaces = [...data.workspaces];
    finalWorkspaces[workspaceIdx] = { ...workspaces[workspaceIdx], widgets: finalWidgets, updatedAt: Date.now() };
    return { ...data, workspaces: finalWorkspaces };
  }
  return null;
}

function applyTodoOp(data: AppData, op: SyncOperation): AppData | null {
  const parts = op.entityId.split('/');
  const workspaceId = parts[0];
  const widgetId = parts[1];
  const todoId = parts[2];
  const workspaceIdx = data.workspaces.findIndex((w) => w.id === workspaceId);
  if (workspaceIdx < 0) return null;
  const workspace = data.workspaces[workspaceIdx];
  const widgetIdx = workspace.widgets.findIndex((w) => w.id === widgetId);
  if (widgetIdx < 0) return null;
  const widget = workspace.widgets[widgetIdx];
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
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'patch') {
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return null;
    const items = [...widget.items];
    items[tIdx] = { ...items[tIdx], ...(op.payload as object), updatedAt: Date.now() };
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'delete') {
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return data;
    const items = widget.items.filter((t) => t.id !== todoId);
    const widgets = [...workspace.widgets];
    widgets[widgetIdx] = { ...widget, items };
    const workspaces = [...data.workspaces];
    workspaces[workspaceIdx] = { ...workspace, widgets, updatedAt: Date.now() };
    return { ...data, workspaces };
  }
  if (op.action === 'move') {
    const { toWidgetId, toIndex } = op.payload as { toWidgetId: string; toIndex: number };
    const tIdx = widget.items.findIndex((t) => t.id === todoId);
    if (tIdx < 0) return null;
    const todo = widget.items[tIdx];

    let workspaces = [...data.workspaces];
    const sourceWidgets = [...workspace.widgets];
    const sourceWidget = sourceWidgets[widgetIdx];
    if (sourceWidget.type !== 'todo') return null;
    sourceWidgets[widgetIdx] = { ...sourceWidget, items: sourceWidget.items.filter((t) => t.id !== todoId) };
    workspaces[workspaceIdx] = { ...workspace, widgets: sourceWidgets, updatedAt: Date.now() };

    const targetWIdx = workspaces[workspaceIdx].widgets.findIndex((w) => w.id === toWidgetId);
    if (targetWIdx < 0) return null;
    const targetWidget = workspaces[workspaceIdx].widgets[targetWIdx];
    if (targetWidget.type !== 'todo') return null;
    const targetItems = [...targetWidget.items];
    targetItems.splice(Math.min(toIndex, targetItems.length), 0, todo);
    const finalWidgets = [...workspaces[workspaceIdx].widgets];
    finalWidgets[targetWIdx] = { ...targetWidget, items: targetItems };

    const finalWorkspaces = [...data.workspaces];
    finalWorkspaces[workspaceIdx] = { ...workspaces[workspaceIdx], widgets: finalWidgets, updatedAt: Date.now() };
    return { ...data, workspaces: finalWorkspaces };
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
    return { ...data, settings: { ...data.settings, ...syncPayload } };
  }
  return null;
}

function applyThemeConfigOp(data: AppData, op: SyncOperation): AppData | null {
  if (op.action === 'put' || op.action === 'patch') {
    return { ...data, settings: { ...data.settings, themeConfig: op.payload as AppSettings['themeConfig'] } };
  }
  return null;
}

function applyTopWidgetsOp(data: AppData, op: SyncOperation): AppData | null {
  if (op.action === 'put' || op.action === 'patch') {
    if (!Array.isArray(op.payload)) return null;
    return { ...data, settings: { ...data.settings, topWidgets: op.payload as AppSettings['topWidgets'] } };
  }
  return null;
}

async function syncWorkspaces(
  userId: string,
  localWorkspaces: Workspace[],
  remoteWorkspaces: Workspace[],
  remoteRevisions: Record<string, number>,
): Promise<{
  pushed: number;
  revisions: Record<string, number>;
  confirmedDeletedIds: Set<string>;
  failedWorkspaceIds: Set<string>;
}> {
  const remoteMap = new Map(remoteWorkspaces.map((w) => [w.id, w]));
  const localMap = new Map(localWorkspaces.map((w) => [w.id, w]));

  let pushed = 0;
  const revisions: Record<string, number> = { ...remoteRevisions };
  const confirmedDeletedIds = new Set<string>();
  const failedWorkspaceIds = new Set<string>();

  for (const [index, workspace] of localWorkspaces.entries()) {
    const remote = remoteMap.get(workspace.id);
    const localWs = localMap.get(workspace.id);
    const baseRevision = remoteRevisions[workspace.id] ?? 0;
    const shouldCompactRemote = Boolean(
      workspace.deletedAt && remote?.deletedAt && remote.widgets.length > 0,
    );

    const shouldPush = shouldCompactRemote || !remote || Boolean(
      localWs && (
        localWs.updatedAt > (remote.updatedAt ?? 0) ||
        (localWs.position ?? index) !== (remote.position ?? index)
      )
    );

    if (shouldPush) {
      try {
        const result = await pushWorkspace(userId, workspace, baseRevision, workspace.position ?? index);
        if (result.accepted) {
          revisions[workspace.id] = result.revision;
          if (workspace.deletedAt) confirmedDeletedIds.add(workspace.id);
          pushed++;
        } else {
          revisions[workspace.id] = result.revision;
          failedWorkspaceIds.add(workspace.id);
        }
      } catch (err) {
        logError(`push workspace ${workspace.id}`, err);
        failedWorkspaceIds.add(workspace.id);
      }
    } else {
      revisions[workspace.id] = baseRevision;
      if (workspace.deletedAt && remote?.deletedAt) confirmedDeletedIds.add(workspace.id);
    }
  }

  return { pushed, revisions, confirmedDeletedIds, failedWorkspaceIds };
}

async function syncPreferences(
  userId: string,
  local: AppData,
  remoteSettings: Partial<AppSettings> | null,
  remoteRevision: number,
  remoteUpdatedAt: string | null,
  meta: SyncMeta,
): Promise<{ pushed: boolean; revision: number; failed: boolean }> {
  const baseRevision = remoteRevision;
  const localSettingsTime = meta.settingsUpdatedAt ?? 0;
  const remoteSettingsTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;

  const shouldPush = !remoteSettings || localSettingsTime > remoteSettingsTime;

  if (shouldPush) {
    try {
      const result = await pushPreferences(userId, local.settings, baseRevision);
      return { pushed: result.accepted, revision: result.revision, failed: !result.accepted };
    } catch (err) {
      logError('push preferences', err);
      return { pushed: false, revision: baseRevision, failed: true };
    }
  }

  return { pushed: false, revision: baseRevision, failed: false };
}

function getOperationWorkspaceId(operation: SyncOperation): string | null {
  if (operation.entity === 'board') return operation.entityId;
  if (operation.entity === 'widget' || operation.entity === 'link' || operation.entity === 'todo') {
    return operation.entityId.split('/')[0] ?? null;
  }
  return null;
}

function isSettingsOperation(operation: SyncOperation): boolean {
  return operation.entity === 'settings' || operation.entity === 'themeConfig' || operation.entity === 'topWidgets';
}

function filterUnclassified(ops: SyncOperation[], classified: Set<string>): SyncOperation[] {
  const result: SyncOperation[] = [];
  for (const op of ops) {
    if (!classified.has(op.opId)) {
      classified.add(op.opId);
      result.push(op);
    }
  }
  return result;
}

async function fullSyncCycle(userId: string, incomingLocal?: AppData): Promise<AppData> {
  if (activeFullSync?.userId === userId) {
    return activeFullSync.promise;
  }

  const run = async (): Promise<AppData> => {
    const classifiedInCycle = new Set<string>();

    let local = incomingLocal ?? (await currentLocalData());
    local = migrateAppData(local);

    const meta = await loadSyncMeta();
    const pendingOps = await getPendingOperations(userId);

    const remoteWorkspacesResult = await fetchRemoteWorkspaces(userId);
    const remotePreferencesResult = await fetchRemotePreferences(userId);
    let remoteAppData: AppData = {
      ...local,
      workspaces: remoteWorkspacesResult.workspaces,
      settings: remotePreferencesResult.settings
        ? { ...local.settings, ...remotePreferencesResult.settings }
        : local.settings,
    };
    remoteAppData = migrateAppData(remoteAppData);

    let merged: AppData;
    let appliedOpIds = new Set<string>();
    let unapplied: SyncOperation[] = [];
    const mergedBase = mergeAppData(local, remoteAppData);

    if (pendingOps.length > 0) {
      const applied = applyOperationsToData(mergedBase, pendingOps);
      merged = applied.data;
      appliedOpIds = applied.appliedOpIds;
      unapplied = applied.unapplied;
    } else {
      merged = mergedBase;
    }

    merged = preserveLocalOnly(merged, await currentLocalData());

    const settingsChanged = pendingOps.some((op) =>
      op.entity === 'settings' || op.entity === 'themeConfig' || op.entity === 'topWidgets'
    );
    if (settingsChanged) {
      meta.settingsUpdatedAt = Date.now();
    }

    const shouldPush = appliedOpIds.size > 0 || !sameContent(merged, remoteAppData);

    const workspaceSync = shouldPush
      ? await syncWorkspaces(
          userId,
          merged.workspaces,
          remoteWorkspacesResult.workspaces,
          remoteWorkspacesResult.revisions,
        )
      : {
          pushed: 0,
          revisions: remoteWorkspacesResult.revisions,
          confirmedDeletedIds: new Set<string>(),
          failedWorkspaceIds: new Set<string>(),
        };

    const preferencesSync = shouldPush
      ? await syncPreferences(
          userId,
          merged,
          remotePreferencesResult.settings,
          remotePreferencesResult.revision,
          remotePreferencesResult.updatedAt,
          meta,
        )
      : { pushed: false, revision: remotePreferencesResult.revision, failed: false };

    const ackableOpIds = new Set(
      [...appliedOpIds].filter((opId) => {
        const operation = pendingOps.find((candidate) => candidate.opId === opId);
        if (!operation) return false;
        if (isSettingsOperation(operation)) return !preferencesSync.failed;
        const workspaceId = getOperationWorkspaceId(operation);
        return !workspaceId || !workspaceSync.failedWorkspaceIds.has(workspaceId);
      }),
    );

    if (ackableOpIds.size > 0) {
      markOperationsCommitted(ackableOpIds, userId);
      try {
        const highestWorkspaceRevision = Math.max(
          0,
          ...Object.values(workspaceSync.revisions),
          preferencesSync.revision,
        );
        await ackOperations(ackableOpIds, highestWorkspaceRevision, userId);
      } catch {
        logError('ackOperations', new Error('ackOperations failed after push'));
      }
    }

    if (unapplied.length > 0) {
      const fresh = filterUnclassified(unapplied, classifiedInCycle);
      if (fresh.length > 0) await classifyDeadLetters(fresh, userId);
    }

    const live = await currentLocalData();
    const freshOps = await getPendingOperations(userId);
    if (freshOps.length > 0) {
      const applied = applyOperationsToData(merged, freshOps);
      merged = applied.data;
      if (applied.unapplied.length > 0) {
        const fresh = filterUnclassified(applied.unapplied, classifiedInCycle);
        if (fresh.length > 0) await classifyDeadLetters(fresh, userId);
      }
    }
    merged = preserveLocalOnly(merged, live);

    const remoteDeletedIds = new Set(
      remoteWorkspacesResult.workspaces
        .filter((workspace) => workspace.deletedAt)
        .filter((workspace) => merged.workspaces.some((candidate) => candidate.id === workspace.id && candidate.deletedAt))
        .map((workspace) => workspace.id),
    );
    const confirmedDeletedIds = new Set([...remoteDeletedIds, ...workspaceSync.confirmedDeletedIds]);
    merged = purgeConfirmedDeletedWorkspaces(merged, confirmedDeletedIds);

    const nextMeta: SyncMeta = {
      ...meta,
      owner: userId,
      lastSyncAt: Date.now(),
      settingsUpdatedAt: preferencesSync.pushed ? Date.now() : meta.settingsUpdatedAt,
      workspaceRevisions: workspaceSync.revisions,
    };

    const saveResult = await saveData(merged);
    if (saveResult.ok) {
      setState({ storageFailure: false });
    }
    await saveSyncMeta(nextMeta);

    remoteAppliedHandler?.(merged);
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
  const dlCount = await getDeadLetterCount(currentOwner);
  setState({ pendingOperations: count, deadLetterCount: dlCount });
}

function scheduleLocalSyncRetry(): void {
  if (localMutationTimer) return;
  localMutationTimer = setTimeout(() => {
    localMutationTimer = null;
    if (syncNowInFlight) {
      scheduleLocalSyncRetry();
      return;
    }
    syncNow();
  }, LOCK_RETRY_MS);
}

async function drainOutbox(userId: string, force = false, incomingLocal?: AppData): Promise<AppData | null> {
  const lease = await acquireSyncLease(userId, force);
  if (!lease) {
    await updatePendingCount();
    if (force) scheduleLocalSyncRetry();
    return null;
  }

  if (!realtimeCleanup) startRealtime(userId);
  setState({ status: 'syncing' });
  let syncedData: AppData | null = null;
  try {
    await withSyncTimeout(async () => {
      await updatePendingCount();
      syncedData = await fullSyncCycle(userId, incomingLocal);
    });
    await lease.complete();
    setState({ status: 'idle', lastSyncAt: Date.now() });
  } catch (err) {
    recordError(err);
  } finally {
    await lease.release().catch(() => undefined);
    if (state.status === 'syncing') {
      setState({ status: 'idle' });
    }
  }
  return syncedData;
}

export function syncNow(): void {
  if (syncNowInFlight) return;

  syncNowInFlight = true;

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

      const session = await withSyncTimeout(() => getSession());
      if (!session?.user) {
        setState({ status: 'idle' });
        return;
      }

      const userId = session.user.id;

      let local = await currentLocalData();
      local = await withSyncTimeout(() => resolveOwnerForSync(local, userId));

      await drainOutbox(userId, true, local);
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
    startStorageFailureListener();
    return local;
  }

  startAuthListener();
  startStorageFailureListener();

  try {
    const can = await canSync();
    if (!can) {
      setState({ status: 'idle' });
      await updatePendingCount();
      return local;
    }

    const session = await withSyncTimeout(() => getSession());
    if (!session?.user) {
      setState({ status: 'idle' });
      return local;
    }

    const userId = session.user.id;
    local = await withSyncTimeout(() => resolveOwnerForSync(local, userId));

    const synced = await drainOutbox(userId, false, local);
    if (synced) local = synced;
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
  if (localMutationTimer) clearTimeout(localMutationTimer);
  localMutationTimer = setTimeout(() => {
    localMutationTimer = null;
    syncNow();
  }, 750);
}

export async function retryDeadLetters(): Promise<number> {
  const owner = currentOwner;
  if (!owner) return 0;

  try {
    const count = await requeueDeadLetters(owner);
    if (count > 0) {
      await updatePendingCount();
      syncNow();
    }
    return count;
  } catch (err) {
    recordError(err);
    throw err;
  }
}

async function handleRemoteChange(userId: string): Promise<void> {
  try {
    const session = await getSession();
    if (!session?.user || session.user.id !== userId) return;

    const can = await canSync();
    if (!can) return;

    const meta = await loadSyncMeta();
    if (meta.owner && meta.owner !== userId) return;

    const synced = await drainOutbox(userId, false);
    if (!synced) return;

    const syncedAt = Date.now();
    setState({ lastPullAt: syncedAt, lastSyncAt: syncedAt });
  } catch (err) {
    logError('failed to apply remote change', err);
  }
}

function scheduleRemoteChange(userId: string): void {
  if (remoteChangeTimer) clearTimeout(remoteChangeTimer);
  remoteChangeTimer = setTimeout(() => {
    remoteChangeTimer = null;
    void handleRemoteChange(userId);
  }, 200);
}

function startRealtime(userId: string): void {
  try {
    realtimeCleanup = subscribeToRealtime(userId, () => {
      scheduleRemoteChange(userId);
    });
  } catch {
    // Realtime not available, fall back to pull-based sync
  }
}

async function handleAuthStateChange(session: Session | null, event: AuthChangeEvent): Promise<void> {
  if (event === 'SIGNED_OUT') {
    if (realtimeCleanup) {
      realtimeCleanup();
      realtimeCleanup = null;
    }
    unsubscribeRealtime();
    setOutboxOwner(undefined);
    currentOwner = undefined;
    clearCommittedInMemory();
    await updatePendingCount();
    setState({ status: 'idle' });
    return;
  }

  if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return;

  if (session?.user) {
    try {
      const can = await canSync();
      if (!can) return;

      const userId = session.user.id;

      let local = await currentLocalData();
      local = await withSyncTimeout(() => resolveOwnerForSync(local, userId));

      await drainOutbox(userId, false, local);
    } catch (err) {
      logError('auth change failed', err);
      recordError(err);
    }
  }
}

function startAuthListener(): void {
  if (authUnsubscribe || !supabase) return;

  authUnsubscribe = subscribeAuthState((session, event) => {
    // Supabase holds its auth lock while notifying listeners. Defer all work
    // that calls Supabase until that notification has fully returned.
    setTimeout(() => {
      void handleAuthStateChange(session, event).catch((err) => {
        recordError(err);
      });
    }, 0);
  });
}

export async function syncOnOnline(): Promise<void> {
  try {
    const can = await canSync();
    if (!can) {
      setState({ status: 'idle' });
      return;
    }

    const session = await withSyncTimeout(() => getSession());
    if (!session?.user) {
      setState({ status: 'idle' });
      return;
    }

    const userId = session.user.id;

    let local = await currentLocalData();
    local = await withSyncTimeout(() => resolveOwnerForSync(local, userId));

    await drainOutbox(userId, false, local);
  } catch (err) {
    recordError(err);
  }
}

function startStorageFailureListener(): void {
  if (storageFailureUnsubscribe) return;
  storageFailureUnsubscribe = onStorageFailure(() => {
    setState({ storageFailure: true });
  });
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
  if (storageFailureUnsubscribe) {
    storageFailureUnsubscribe();
    storageFailureUnsubscribe = null;
  }
  unsubscribeRealtime();
  if (localMutationTimer) {
    clearTimeout(localMutationTimer);
    localMutationTimer = null;
  }
  if (remoteChangeTimer) {
    clearTimeout(remoteChangeTimer);
    remoteChangeTimer = null;
  }
  localDataProvider = null;
  remoteAppliedHandler = null;
  syncNowInFlight = false;
  currentOwner = undefined;
  setOutboxOwner(undefined);
  clearCommittedInMemory();
  setState({ status: 'idle' });
}

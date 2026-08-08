import { browser } from '@shared/browser';
import { getDefaultData } from '@shared/types/defaults';
import type { AppData, Board, SyncMeta, Workspace } from '@shared/types';
import type { Widget } from '@shared/types';
import { migrateAppData } from '@shared/sync/migrate';

export const STORAGE_KEY = 'prismiWorkspaces';
export const LEGACY_STORAGE_KEY = 'boardsNewTabData';
export const SYNC_META_KEY = 'prismiSyncMeta';

export type WriteResult =
  | { ok: true }
  | { ok: false; error: string };

type StorageFailureListener = (error: string) => void;
const storageFailureListeners = new Set<StorageFailureListener>();

export function onStorageFailure(listener: StorageFailureListener): () => void {
  storageFailureListeners.add(listener);
  return () => { storageFailureListeners.delete(listener); };
}

export function notifyStorageFailure(error: string): void {
  for (const listener of storageFailureListeners) {
    try { listener(error); } catch { /* guard */ }
  }
}

function isLegacyAppData(value: unknown): value is { boards: Board[]; settings: AppData['settings']; installedAt?: number } {
  return !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).boards);
}

export function toWorkspace(board: Board): Workspace {
  return { ...board };
}

export function toBoard(workspace: Workspace): Board {
  const { deletedAt: _, position: __, ...board } = workspace;
  return board;
}

export function getWorkspaces(data: AppData): Workspace[] {
  return data.workspaces ?? [];
}

export function getBoards(data: AppData): Board[] {
  return getWorkspaces(data)
    .filter((w) => !w.deletedAt)
    .map(toBoard);
}

export function getWorkspaceById(data: AppData, id: string): Workspace | undefined {
  return getWorkspaces(data).find((w) => w.id === id);
}

export function getBoardById(data: AppData, boardId: string): Board | undefined {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return undefined;
  return toBoard(workspace);
}

export async function loadData(): Promise<AppData> {
  try {
    const result = await browser.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
    const saved = result[STORAGE_KEY] as AppData | undefined;
    if (saved && Array.isArray(saved.workspaces) && saved.settings) {
      const migrated = migrateAppData(saved);
      if (JSON.stringify(migrated) !== JSON.stringify(saved)) {
        await browser.storage.local.set({ [STORAGE_KEY]: migrated });
      }
      return migrated;
    }
    const legacy = result[LEGACY_STORAGE_KEY] as unknown;
    if (isLegacyAppData(legacy)) {
      const migrated = migrateAppData({
        workspaces: legacy.boards.map(toWorkspace),
        settings: legacy.settings,
        installedAt: legacy.installedAt ?? Date.now(),
      });
      try {
        await browser.storage.local.set({ [STORAGE_KEY]: migrated });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Failed to migrate legacy data to new key:', message);
      }
      return migrated;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to load data from storage:', message);
    notifyStorageFailure(`read: ${message}`);
  }
  return getDefaultData();
}

export async function saveData(data: AppData): Promise<WriteResult> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: data });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to save data:', message);
    notifyStorageFailure(`write: ${message}`);
    return { ok: false, error: message };
  }
}

export async function ensureData(): Promise<AppData> {
  const data = await loadData();
  await saveData(data);
  return data;
}

export async function loadSyncMeta(): Promise<SyncMeta> {
  try {
    const result = await browser.storage.local.get(SYNC_META_KEY);
    const saved = result[SYNC_META_KEY] as SyncMeta | undefined;
    if (saved && typeof saved === 'object') {
      return {
        ...saved,
        workspaceRevisions: saved.workspaceRevisions ?? {},
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to load sync meta:', message);
  }
  return { workspaceRevisions: {} };
}

export async function saveSyncMeta(meta: SyncMeta): Promise<WriteResult> {
  try {
    await browser.storage.local.set({ [SYNC_META_KEY]: meta });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to save sync meta:', message);
    notifyStorageFailure(`write meta: ${message}`);
    return { ok: false, error: message };
  }
}

export function updateWorkspace(data: AppData, workspaceId: string, fn: (workspace: Workspace) => Workspace): AppData {
  return {
    ...data,
    workspaces: data.workspaces.map((w) => (w.id === workspaceId ? fn(w) : w))
  };
}

export function updateWidgetInWorkspace(
  data: AppData,
  workspaceId: string,
  widgetId: string,
  fn: (widget: Widget) => Widget,
  updateWorkspaceTimestamp = true,
): AppData {
  return updateWorkspace(data, workspaceId, (workspace) => ({
    ...workspace,
    widgets: workspace.widgets.map((w) => (w.id === widgetId ? fn(w) : w)),
    ...(updateWorkspaceTimestamp ? { updatedAt: Date.now() } : {})
  }));
}

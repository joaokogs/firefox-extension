import { browser } from '@shared/browser';
import { getDefaultData } from '@shared/types/defaults';
import type { AppData } from '@shared/types';
import type { Board } from '@shared/types';
import type { Widget } from '@shared/types';

export const STORAGE_KEY = 'boardsNewTabData';

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

export async function loadData(): Promise<AppData> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY] as AppData | undefined;
    if (saved && saved.boards && saved.settings) {
      return saved;
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

export function updateBoard(data: AppData, boardId: string, fn: (board: Board) => Board): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => (b.id === boardId ? fn(b) : b))
  };
}

export function updateWidgetInBoard(
  data: AppData,
  boardId: string,
  widgetId: string,
  fn: (widget: Widget) => Widget,
  updateBoardTimestamp = true,
): AppData {
  return updateBoard(data, boardId, (board) => ({
    ...board,
    widgets: board.widgets.map((w) => (w.id === widgetId ? fn(w) : w)),
    ...(updateBoardTimestamp ? { updatedAt: Date.now() } : {})
  }));
}

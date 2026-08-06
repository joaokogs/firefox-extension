import type { AppData, Board, AppSettings, TopWidgetConfig } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { LOCAL_ONLY_SETTINGS_KEYS } from '@shared/types/constants';
import { t } from '@shared/i18n';

export function createBoard(title: string): Board {
  const now = Date.now();
  return {
    id: generateId('board'),
    title: title.trim() || t('defaults.newBoard'),
    widgets: [],
    createdAt: now,
    updatedAt: now
  };
}

export function addBoard(data: AppData, board: Board): AppData {
  return {
    ...data,
    boards: [...data.boards, board],
    settings: {
      ...data.settings,
      lastBoardId: board.id
    }
  };
}

export function renameBoard(data: AppData, boardId: string, title: string): AppData {
  return {
    ...data,
    boards: data.boards.map((b) =>
      b.id === boardId ? { ...b, title: title.trim() || b.title, updatedAt: Date.now() } : b
    )
  };
}

export function reorderBoard(data: AppData, boardId: string, toIndex: number): AppData {
  const idx = data.boards.findIndex((b) => b.id === boardId);
  if (idx === -1) return data;
  const clamped = Math.max(0, Math.min(toIndex, data.boards.length - 1));
  if (idx === clamped) return data;
  const boards = [...data.boards];
  const [moved] = boards.splice(idx, 1);
  boards.splice(clamped, 0, moved);
  return { ...data, boards };
}

export function deleteBoard(data: AppData, boardId: string): AppData {
  const now = Date.now();
  const boards = data.boards.filter((b) => b.id !== boardId);
  return {
    ...data,
    boards,
    settings: {
      ...data.settings,
      lastBoardId: boards[0]?.id
    },
    _tombstones: {
      ...data._tombstones,
      deletedBoards: { ...data._tombstones?.deletedBoards, [boardId]: now },
      deletedWidgets: { ...data._tombstones?.deletedWidgets },
      deletedLinks: { ...data._tombstones?.deletedLinks },
      deletedTodos: { ...data._tombstones?.deletedTodos },
    }
  };
}

export function getBoardById(data: AppData, boardId: string): Board | undefined {
  return data.boards.find((b) => b.id === boardId);
}

export function getInitialBoardId(data: AppData): string | undefined {
  if (data.settings.lastBoardId) {
    const exists = data.boards.some((b) => b.id === data.settings.lastBoardId);
    if (exists) return data.settings.lastBoardId;
  }
  return data.boards[0]?.id;
}

export function updateSettings(data: AppData, settings: Partial<AppSettings>): AppData {
  const keys = Object.keys(settings) as (keyof AppSettings)[];
  const isLocalOnly = keys.length > 0 && keys.every((k) => LOCAL_ONLY_SETTINGS_KEYS.includes(k));

  return {
    ...data,
    settings: { ...data.settings, ...settings },
    ...(isLocalOnly ? {} : { settingsUpdatedAt: Date.now() }),
  };
}

export function removeRecentSearch(data: AppData, query: string): AppData {
  const recent = data.settings.recentSearches || [];
  return updateSettings(data, { recentSearches: recent.filter((s) => s !== query) });
}

export function clearRecentSearches(data: AppData): AppData {
  return updateSettings(data, { recentSearches: [] });
}

export function updateTopWidgets(data: AppData, topWidgets: TopWidgetConfig[]): AppData {
  return updateSettings(data, { topWidgets });
}

export function addRecentSearch(data: AppData, query: string): AppData {
  const trimmed = query.trim();
  if (!trimmed) return data;
  const recent = data.settings.recentSearches || [];
  const filtered = recent.filter((s) => s !== trimmed);
  const next = [trimmed, ...filtered].slice(0, 10);
  return updateSettings(data, { recentSearches: next });
}

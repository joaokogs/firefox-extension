import type { AppData, Board, Widget, SyncTombstones, LinkItem, TodoItem, LinksWidget, TodoWidget } from '@shared/types';
import { DEFAULT_WALLPAPERS } from '@shared/types/constants';

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneTombstones(data: AppData): AppData {
  if (!data._tombstones) return data;

  const now = Date.now();
  const cutoff = now - TOMBSTONE_TTL_MS;

  const tombstones = data._tombstones;
  const deletedBoards = tombstones.deletedBoards ?? {};
  const deletedWidgets = tombstones.deletedWidgets ?? {};
  const deletedLinks = tombstones.deletedLinks ?? {};
  const deletedTodos = tombstones.deletedTodos ?? {};

  const aliveBoardIds = new Set(data.boards.map((b) => b.id));

  const prunedBoards: Record<string, number> = {};
  for (const [boardId, ts] of Object.entries(deletedBoards)) {
    if (ts > cutoff) {
      prunedBoards[boardId] = ts;
    }
  }

  function isBoardActive(boardId: string): boolean {
    if (aliveBoardIds.has(boardId)) return true;
    return boardId in prunedBoards;
  }

  const prunedWidgets: Record<string, number> = {};
  for (const [key, ts] of Object.entries(deletedWidgets)) {
    if (ts <= cutoff) continue;
    const boardId = key.split('/')[0];
    if (isBoardActive(boardId)) {
      prunedWidgets[key] = ts;
    }
  }

  const prunedLinks: Record<string, number> = {};
  for (const [key, ts] of Object.entries(deletedLinks)) {
    if (ts <= cutoff) continue;
    const boardId = key.split('/')[0];
    if (isBoardActive(boardId)) {
      prunedLinks[key] = ts;
    }
  }

  const prunedTodos: Record<string, number> = {};
  for (const [key, ts] of Object.entries(deletedTodos)) {
    if (ts <= cutoff) continue;
    const boardId = key.split('/')[0];
    if (isBoardActive(boardId)) {
      prunedTodos[key] = ts;
    }
  }

  return {
    ...data,
    _tombstones: {
      deletedBoards: prunedBoards,
      deletedWidgets: prunedWidgets,
      deletedLinks: prunedLinks,
      deletedTodos: prunedTodos,
    },
  };
}

function emptyTombstones(): SyncTombstones {
  return {
    deletedBoards: {},
    deletedWidgets: {},
    deletedLinks: {},
    deletedTodos: {},
  };
}

function mergeTombstones(a?: SyncTombstones, b?: SyncTombstones): SyncTombstones {
  if (!a && !b) return emptyTombstones();
  return {
    deletedBoards: mergeTimestampMap(a?.deletedBoards, b?.deletedBoards),
    deletedWidgets: mergeTimestampMap(a?.deletedWidgets, b?.deletedWidgets),
    deletedLinks: mergeTimestampMap(a?.deletedLinks, b?.deletedLinks),
    deletedTodos: mergeTimestampMap(a?.deletedTodos, b?.deletedTodos),
  };
}

function mergeTimestampMap(a?: Record<string, number>, b?: Record<string, number>): Record<string, number> {
  const result = { ...(a ?? {}) };
  for (const [key, timestamp] of Object.entries(b ?? {})) {
    result[key] = Math.max(result[key] ?? 0, timestamp);
  }
  return result;
}

function isBoardTombstoned(boardId: string, tombstones: SyncTombstones): boolean {
  const ts = tombstones.deletedBoards[boardId];
  return ts !== undefined;
}

function isWidgetTombstoned(boardId: string, widgetId: string, tombstones: SyncTombstones): boolean {
  const key = `${boardId}/${widgetId}`;
  return tombstones.deletedWidgets[key] !== undefined;
}

function isLinkTombstoned(boardId: string, widgetId: string, linkId: string, tombstones: SyncTombstones): boolean {
  const key = `${boardId}/${widgetId}/${linkId}`;
  return tombstones.deletedLinks[key] !== undefined;
}

function isTodoTombstoned(boardId: string, widgetId: string, todoId: string, tombstones: SyncTombstones): boolean {
  const key = `${boardId}/${widgetId}/${todoId}`;
  return tombstones.deletedTodos[key] !== undefined;
}

function mergeLinks(
  boardId: string,
  widgetId: string,
  localItems: LinkItem[],
  remoteItems: LinkItem[],
  tombstones: SyncTombstones,
): LinkItem[] {
  const map = new Map<string, LinkItem>();

  for (const item of localItems) {
    if (isLinkTombstoned(boardId, widgetId, item.id, tombstones)) {
      const ts = tombstones.deletedLinks[`${boardId}/${widgetId}/${item.id}`];
      if ((item.updatedAt ?? 0) <= ts) continue;
    }
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      map.set(item.id, item);
    }
  }

  for (const item of remoteItems) {
    if (isLinkTombstoned(boardId, widgetId, item.id, tombstones)) {
      const ts = tombstones.deletedLinks[`${boardId}/${widgetId}/${item.id}`];
      if ((item.updatedAt ?? 0) <= ts) continue;
    }
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function mergeTodos(
  boardId: string,
  widgetId: string,
  localItems: TodoItem[],
  remoteItems: TodoItem[],
  tombstones: SyncTombstones,
): TodoItem[] {
  const map = new Map<string, TodoItem>();

  for (const item of localItems) {
    if (isTodoTombstoned(boardId, widgetId, item.id, tombstones)) {
      const ts = tombstones.deletedTodos[`${boardId}/${widgetId}/${item.id}`];
      if ((item.updatedAt ?? 0) <= ts) continue;
    }
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      map.set(item.id, item);
    }
  }

  for (const item of remoteItems) {
    if (isTodoTombstoned(boardId, widgetId, item.id, tombstones)) {
      const ts = tombstones.deletedTodos[`${boardId}/${widgetId}/${item.id}`];
      if ((item.updatedAt ?? 0) <= ts) continue;
    }
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function mergeWidget(
  boardId: string,
  local: Widget,
  remote: Widget,
  tombstones: SyncTombstones,
): Widget {
  if (local.type === 'links' && remote.type === 'links') {
    const mergedItems = mergeLinks(boardId, local.id, local.items, remote.items, tombstones);
    // Metadata (title, layout, ...) follows the newer side; items merge individually below.
    const base: LinksWidget = (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? local : remote;
    return { ...base, items: mergedItems };
  }

  if (local.type === 'todo' && remote.type === 'todo') {
    const mergedItems = mergeTodos(boardId, local.id, local.items, remote.items, tombstones);
    const base: TodoWidget = (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? local : remote;
    return { ...base, items: mergedItems };
  }

  return (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? local : remote;
}

function mergeBoard(
  local: Board,
  remote: Board,
  tombstones: SyncTombstones,
): Board {
  const widgetMap = new Map<string, Widget>();

  for (const w of local.widgets) {
    if (isWidgetTombstoned(local.id, w.id, tombstones)) {
      const ts = tombstones.deletedWidgets[`${local.id}/${w.id}`];
      if ((w.updatedAt ?? 0) <= ts) continue;
    }
    widgetMap.set(w.id, w);
  }

  for (const w of remote.widgets) {
    if (isWidgetTombstoned(remote.id, w.id, tombstones)) {
      const ts = tombstones.deletedWidgets[`${remote.id}/${w.id}`];
      if ((w.updatedAt ?? 0) <= ts) continue;
    }
    const existing = widgetMap.get(w.id);
    if (existing) {
      widgetMap.set(w.id, mergeWidget(remote.id, existing, w, tombstones));
    } else {
      widgetMap.set(w.id, w);
    }
  }

  const baseBoard = local.updatedAt >= remote.updatedAt ? local : remote;
  return {
    ...baseBoard,
    widgets: Array.from(widgetMap.values()),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    createdAt: Math.min(local.createdAt, remote.createdAt),
  };
}

export function mergeAppData(local: AppData, remote: AppData): AppData {
  const tombstones = mergeTombstones(local._tombstones, remote._tombstones);

  const boardMap = new Map<string, Board>();

  for (const board of local.boards) {
    if (isBoardTombstoned(board.id, tombstones)) {
      const ts = tombstones.deletedBoards[board.id];
      if (board.updatedAt <= ts) continue;
    }
    boardMap.set(board.id, board);
  }

  for (const board of remote.boards) {
    if (isBoardTombstoned(board.id, tombstones)) {
      const ts = tombstones.deletedBoards[board.id];
      if (board.updatedAt <= ts) continue;
    }
    const existing = boardMap.get(board.id);
    if (existing) {
      boardMap.set(board.id, mergeBoard(existing, board, tombstones));
    } else {
      boardMap.set(board.id, board);
    }
  }

  const mergedBoards = Array.from(boardMap.values());

  const localSettingsTime = local.settingsUpdatedAt ?? 0;
  const remoteSettingsTime = remote.settingsUpdatedAt ?? 0;
  const settings = {
    ...(localSettingsTime >= remoteSettingsTime
      ? { ...remote.settings, ...local.settings }
      : { ...local.settings, ...remote.settings }),
    wallpaper: local.settings.wallpaper ?? DEFAULT_WALLPAPERS[0],
    uploadedBackgrounds: local.settings.uploadedBackgrounds,
  };

  // Guard against legacy data without installedAt producing NaN.
  const localInstalledAt = local.installedAt ?? Number.MAX_SAFE_INTEGER;
  const remoteInstalledAt = remote.installedAt ?? Number.MAX_SAFE_INTEGER;
  const minInstalledAt = Math.min(localInstalledAt, remoteInstalledAt);

  return {
    boards: mergedBoards,
    settings,
    installedAt: minInstalledAt === Number.MAX_SAFE_INTEGER ? Date.now() : minInstalledAt,
    lastSyncedAt: Date.now(),
    settingsUpdatedAt: Math.max(localSettingsTime, remoteSettingsTime),
    _tombstones: tombstones,
    // Keep the owner through the merge; dropping it would let the next login
    // treat this data as unowned and merge it into a different account.
    _owner: local._owner ?? remote._owner,
  };
}

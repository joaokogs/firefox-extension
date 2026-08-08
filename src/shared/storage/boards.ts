import type { AppData, AppSettings, Board, TopWidgetConfig, Workspace } from '@shared/types';
import { generateWorkspaceId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { getBoards, getWorkspaceById, toBoard, toWorkspace, updateWorkspace } from './index';

export function createBoard(title: string): Board {
  const now = Date.now();
  return {
    id: generateWorkspaceId(),
    title: title.trim() || t('defaults.newBoard'),
    widgets: [],
    createdAt: now,
    updatedAt: now
  };
}

export function addBoard(data: AppData, board: Board): AppData {
  const workspace = { ...toWorkspace(board), position: data.workspaces.length };
  return {
    ...data,
    workspaces: [...data.workspaces, workspace],
    settings: {
      ...data.settings,
      lastBoardId: workspace.id
    }
  };
}

export function renameBoard(data: AppData, boardId: string, title: string): AppData {
  return updateWorkspace(data, boardId, (workspace) => ({
    ...workspace,
    title: title.trim() || workspace.title,
    updatedAt: Date.now(),
  }));
}

export function reorderBoard(data: AppData, boardId: string, toIndex: number): AppData {
  const visible = getBoards(data);
  const idx = visible.findIndex((b) => b.id === boardId);
  if (idx === -1) return data;
  const clamped = Math.max(0, Math.min(toIndex, visible.length - 1));
  if (idx === clamped) return data;
  const reordered = [...visible];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(clamped, 0, moved);

  const orderMap = new Map(reordered.map((b, i) => [b.id, i]));
  const deletedWorkspaces = data.workspaces.filter((w) => w.deletedAt);
  const visibleWorkspaces = data.workspaces.filter((w) => !w.deletedAt);
  const now = Date.now();
  visibleWorkspaces.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  const orderedWorkspaces = [...visibleWorkspaces].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return {
    ...data,
    workspaces: [...orderedWorkspaces, ...deletedWorkspaces].map((w, index) => ({
      ...w,
      updatedAt: w.deletedAt ? w.updatedAt : now,
      position: index,
    } as Workspace)),
  };
}

export function deleteBoard(data: AppData, boardId: string): AppData {
  const now = Date.now();
  const next = updateWorkspace(data, boardId, (workspace) => ({
    ...workspace,
    deletedAt: now,
    updatedAt: now,
  }));
  const visible = getBoards(next);
  return {
    ...next,
    settings: {
      ...next.settings,
      lastBoardId: visible[0]?.id
    }
  };
}

export function getBoardById(data: AppData, boardId: string): Board | undefined {
  const workspace = getWorkspaceById(data, boardId);
  if (!workspace || workspace.deletedAt) return undefined;
  return toBoard(workspace);
}

export function getInitialBoardId(data: AppData): string | undefined {
  if (data.settings.lastBoardId) {
    const exists = getBoards(data).some((b) => b.id === data.settings.lastBoardId);
    if (exists) return data.settings.lastBoardId;
  }
  return getBoards(data)[0]?.id;
}

export function updateSettings(data: AppData, settings: Partial<AppSettings>): AppData {
  return {
    ...data,
    settings: { ...data.settings, ...settings },
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

export function boardToWorkspace(board: Board): Workspace {
  return toWorkspace(board);
}

import type { AppData, Board, LinkItem, TodoItem, Widget } from '@shared/types';
import { generateId } from '@shared/types/defaults';

export function migrateAppData(data: AppData, fallbackTimestamp?: number): AppData {
  const now = Date.now();
  const fallback = fallbackTimestamp ?? data.installedAt ?? now - 86400000;

  const base: AppData = {
    ...data,
    installedAt: data.installedAt ?? now,
  };

  const boardIds = new Set<string>();
  const boards = base.boards.map((board) => migrateBoard(board, fallback, boardIds));
  return { ...base, boards };
}

function migrateBoard(board: Board, fallback: number, usedBoardIds: Set<string>): Board {
  const legacyBoard = board as Board & { id?: string; createdAt?: number; updatedAt?: number };
  const id = getUniqueId(legacyBoard.id, 'board', usedBoardIds);
  const widgetIds = new Set<string>();
  const widgets = board.widgets.map((widget) => migrateWidget(widget, fallback, widgetIds));

  return {
    ...board,
    id,
    createdAt: getTimestamp(legacyBoard.createdAt, fallback),
    updatedAt: getTimestamp(legacyBoard.updatedAt, fallback),
    widgets,
  };
}

function migrateWidget(widget: Widget, fallback: number, usedWidgetIds: Set<string>): Widget {
  const legacyWidget = widget as Widget & { id?: string; updatedAt?: number };
  const id = getUniqueId(legacyWidget.id, 'widget', usedWidgetIds);
  const base = { ...widget, id, updatedAt: getTimestamp(legacyWidget.updatedAt, fallback) };

  if (widget.type === 'links') {
    const itemIds = new Set<string>();
    return {
      ...base,
      type: 'links',
      items: widget.items.map((item) => migrateItem(item, 'link', fallback, itemIds)),
    };
  }

  if (widget.type === 'todo') {
    const itemIds = new Set<string>();
    return {
      ...base,
      type: 'todo',
      items: widget.items.map((item) => migrateItem(item, 'todo', fallback, itemIds)),
    };
  }

  return base;
}

function migrateItem<T extends LinkItem | TodoItem>(
  item: T,
  prefix: 'link' | 'todo',
  fallback: number,
  usedIds: Set<string>,
): T {
  const legacyItem = item as T & { id?: string; createdAt?: number; updatedAt?: number };
  return {
    ...item,
    id: getUniqueId(legacyItem.id, prefix, usedIds),
    createdAt: getTimestamp(legacyItem.createdAt, fallback),
    updatedAt: getTimestamp(legacyItem.updatedAt, fallback),
  } as T;
}

function getTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getUniqueId(value: unknown, prefix: string, usedIds: Set<string>): string {
  const candidate = typeof value === 'string' && value.trim() ? value : undefined;
  if (candidate && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let id = generateId(prefix);
  while (usedIds.has(id)) id = generateId(prefix);
  usedIds.add(id);
  return id;
}

import type { AppData, Board, LinkItem, TodoItem, TopWidgetConfig, Widget, Workspace } from '@shared/types';
import { generateId, generateWorkspaceId } from '@shared/types/defaults';

export function migrateAppData(data: AppData, fallbackTimestamp?: number): AppData {
  const now = Date.now();
  const fallback = fallbackTimestamp ?? data.installedAt ?? now - 86400000;

  const legacyBoards = (data as unknown as { boards?: Board[] }).boards;
  const sourceWorkspaces: Workspace[] = Array.isArray(data.workspaces)
    ? data.workspaces
    : Array.isArray(legacyBoards)
      ? legacyBoards
      : [];

  const base: AppData = {
    ...data,
    installedAt: data.installedAt ?? now,
    settings: {
      ...data.settings,
      topWidgets: normalizeTopWidgets(data.settings?.topWidgets),
    },
    workspaces: sourceWorkspaces,
  };

  const legacyFields = base as unknown as {
    boards?: unknown;
    _tombstones?: unknown;
    _owner?: unknown;
    lastSyncedAt?: unknown;
    settingsUpdatedAt?: unknown;
  };
  delete legacyFields.boards;
  delete legacyFields._tombstones;
  delete legacyFields._owner;
  delete legacyFields.lastSyncedAt;
  delete legacyFields.settingsUpdatedAt;

  const workspaceIds = new Set<string>();
  const workspaceIdMap = new Map<string, string>();
  const workspaces = base.workspaces.map((workspace, index) => {
    const migrated = migrateWorkspace(workspace, fallback, workspaceIds, index);
    workspaceIdMap.set(workspace.id, migrated.id);
    return migrated;
  });

  const legacyLastBoardId = base.settings.lastBoardId;
  const lastBoardId = legacyLastBoardId
    ? workspaceIdMap.get(legacyLastBoardId) ?? legacyLastBoardId
    : workspaces[0]?.id;

  return {
    ...base,
    workspaces,
    settings: { ...base.settings, lastBoardId },
  };
}

function normalizeTopWidgets(value: unknown): TopWidgetConfig[] {
  const fallback: TopWidgetConfig[] = [
    { type: 'weather', city: 'New York' },
    { type: 'clock' },
    { type: 'search' },
  ];

  if (!Array.isArray(value)) return fallback;

  return value.filter((widget): widget is TopWidgetConfig => {
    if (!widget || typeof widget !== 'object') return false;
    const type = (widget as { type?: unknown }).type;
    return type === 'clock' || type === 'weather' || type === 'search';
  });
}

function migrateWorkspace(workspace: Workspace, fallback: number, usedWorkspaceIds: Set<string>, position: number): Workspace {
  const legacyWorkspace = workspace as Workspace & { id?: string; createdAt?: number; updatedAt?: number };
  const id = getWorkspaceId(legacyWorkspace.id, usedWorkspaceIds);
  const widgetIds = new Set<string>();
  const widgets = workspace.widgets.map((widget) => migrateWidget(widget, fallback, widgetIds));

  return {
    ...workspace,
    id,
    position,
    createdAt: getTimestamp(legacyWorkspace.createdAt, fallback),
    updatedAt: getTimestamp(legacyWorkspace.updatedAt, fallback),
    widgets,
  };
}

function getWorkspaceId(value: unknown, usedIds: Set<string>): string {
  const candidate = typeof value === 'string' && value.trim() ? value : undefined;
  const isUuid = candidate
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    : false;

  if (isUuid && !usedIds.has(candidate!)) {
    usedIds.add(candidate!);
    return candidate!;
  }

  let id = generateWorkspaceId();
  while (usedIds.has(id)) id = generateWorkspaceId();
  usedIds.add(id);
  return id;
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

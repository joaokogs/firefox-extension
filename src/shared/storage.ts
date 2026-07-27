/**
 * Centralized, async storage helpers.
 * All persisted state lives in browser.storage.local.
 * Components should never touch the storage API directly.
 */

import { browser } from './browser';
import { t } from '@shared/i18n';
import type {
  AppData,
  AppSettings,
  Board,
  LinkItem,
  TodoItem,
  TopWidgetConfig,
  Widget,
  WidgetType
} from './types';
import { getDefaultData, generateId } from './types';

const STORAGE_KEY = 'boardsNewTabData';

export async function loadData(): Promise<AppData> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY] as AppData | undefined;
    if (saved && saved.boards && saved.settings) {
      return saved;
    }
  } catch (err) {
    console.error('Failed to load data from storage:', err);
  }
  return getDefaultData();
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: data });
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

export async function ensureData(): Promise<AppData> {
  const data = await loadData();
  await saveData(data);
  return data;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getFaviconUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return '';
  }
}

function updateBoard(data: AppData, boardId: string, fn: (board: Board) => Board): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => (b.id === boardId ? fn(b) : b))
  };
}

function updateWidgetInBoard(data: AppData, boardId: string, widgetId: string, fn: (widget: Widget) => Widget): AppData {
  return updateBoard(data, boardId, (board) => ({
    ...board,
    widgets: board.widgets.map((w) => (w.id === widgetId ? fn(w) : w)),
    updatedAt: Date.now()
  }));
}

// Boards
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
  const boards = data.boards.filter((b) => b.id !== boardId);
  return {
    ...data,
    boards,
    settings: {
      ...data.settings,
      lastBoardId: boards[0]?.id
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
  return {
    ...data,
    settings: { ...data.settings, ...settings }
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

// Widgets
export function createWidget(type: WidgetType, title: string): Widget {
  const base = {
    id: generateId('widget'),
    type,
    title: title.trim() || defaultWidgetTitle(type),
    colSpan: 1,
    order: 0
  };

  switch (type) {
    case 'links':
      return { ...base, type: 'links', items: [] };
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return { ...base, type: 'clock' };
    case 'weather':
      return { ...base, type: 'weather', city: 'New York' };
    case 'todo':
      return { ...base, type: 'todo', items: [] };
  }
}

function defaultWidgetTitle(type: WidgetType): string {
  switch (type) {
    case 'links':
      return t('defaults.linksWidget');
    case 'calendar':
      return t('defaults.calendarWidget');
    case 'clock':
      return t('defaults.clockWidget');
    case 'weather':
      return t('defaults.weatherWidget');
    case 'todo':
      return t('defaults.todoWidget');
  }
}

export function addWidget(data: AppData, boardId: string, widget: Widget): AppData {
  return updateBoard(data, boardId, (board) => {
    const maxOrder = board.widgets.reduce((max, w) => Math.max(max, w.order), -1);
    return { ...board, widgets: [...board.widgets, { ...widget, order: maxOrder + 1 }], updatedAt: Date.now() };
  });
}

export function deleteWidget(data: AppData, boardId: string, widgetId: string): AppData {
  return updateBoard(data, boardId, (board) => ({
    ...board,
    widgets: board.widgets.filter((w) => w.id !== widgetId),
    updatedAt: Date.now()
  }));
}

export function updateWidget(data: AppData, boardId: string, widgetId: string, updates: Partial<Omit<Widget, 'id' | 'type'>> & { title?: string; colSpan?: number; order?: number; height?: number; col?: number }): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) => ({ ...w, ...updates }));
}

export function moveWidgetOrder(data: AppData, boardId: string, fromIndex: number, toIndex: number): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;
      const sorted = [...b.widgets].sort((a, c) => a.order - c.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      const reordered = sorted.map((w, i) => ({ ...w, order: i }));
      return { ...b, widgets: reordered, updatedAt: Date.now() };
    })
  };
}

export function reorderWidgets(data: AppData, boardId: string, widgetIds: string[]): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;
      const map = new Map(b.widgets.map((w) => [w.id, w]));
      const reordered = widgetIds.map((id, i) => {
        const w = map.get(id);
        return w ? { ...w, order: i } : undefined;
      }).filter((w): w is Widget => !!w);
      return { ...b, widgets: reordered, updatedAt: Date.now() };
    })
  };
}

// Links inside a widget
export function createLink(title: string, url: string, icon?: string | null): LinkItem {
  return {
    id: generateId('link'),
    title: title.trim() || t('defaults.newLink'),
    url: normalizeUrl(url),
    icon: icon || undefined
  };
}

export function addLink(data: AppData, boardId: string, widgetId: string, link: LinkItem): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'links' ? { ...w, items: [...w.items, link] } : w
  );
}

export function deleteLink(data: AppData, boardId: string, widgetId: string, linkId: string): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'links' ? { ...w, items: w.items.filter((l) => l.id !== linkId) } : w
  );
}

export function updateLink(
  data: AppData,
  boardId: string,
  widgetId: string,
  linkId: string,
  updates: Partial<LinkItem>
): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'links'
      ? { ...w, items: w.items.map((l) => (l.id === linkId ? { ...l, ...updates } : l)) }
      : w
  );
}

export function searchLinks(data: AppData, query: string): LinkItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: LinkItem[] = [];
  for (const board of data.boards) {
    for (const widget of board.widgets) {
      if (widget.type !== 'links') continue;
      for (const item of widget.items) {
        if (item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) {
          matches.push(item);
        }
      }
    }
  }
  return matches;
}

export function getWidgetById(data: AppData, boardId: string, widgetId: string): Widget | undefined {
  return data.boards.find((b) => b.id === boardId)?.widgets.find((w) => w.id === widgetId);
}

export function getWidgetsForBoard(data: AppData, boardId: string): Widget[] {
  const board = getBoardById(data, boardId);
  if (!board) return [];
  return [...board.widgets].sort((a, b) => a.order - b.order);
}

export function moveLink(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  linkId: string,
  toIndex: number
): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;

      let movedLink: LinkItem | undefined;
      let originalIndex = -1;
      let widgets = b.widgets.map((w) => {
        if (w.id === fromWidgetId && w.type === 'links') {
          const idx = w.items.findIndex((l) => l.id === linkId);
          if (idx !== -1) {
            originalIndex = idx;
            movedLink = w.items[idx];
            return { ...w, items: w.items.filter((l) => l.id !== linkId) };
          }
        }
        return w;
      });

      if (movedLink) {
        let adjustedIndex = toIndex;
        if (fromWidgetId === toWidgetId && originalIndex < toIndex) {
          adjustedIndex = toIndex - 1;
        }
        widgets = widgets.map((w) => {
          if (w.id === toWidgetId && w.type === 'links') {
            const items = [...w.items];
            const clampedIndex = Math.min(adjustedIndex, items.length);
            items.splice(clampedIndex, 0, movedLink!);
            return { ...w, items };
          }
          return w;
        });
      }

      return { ...b, widgets, updatedAt: Date.now() };
    })
  };
}

// Todo items inside a widget
export function createTodoItem(text: string): TodoItem {
  return {
    id: generateId('todo'),
    text: text.trim() || t('defaults.newNote'),
    done: false
  };
}

export function addTodoItem(data: AppData, boardId: string, widgetId: string, todo: TodoItem): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo' ? { ...w, items: [...w.items, todo] } : w
  );
}

export function deleteTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo' ? { ...w, items: w.items.filter((t) => t.id !== todoId) } : w
  );
}

export function updateTodoItem(
  data: AppData,
  boardId: string,
  widgetId: string,
  todoId: string,
  updates: Partial<TodoItem>
): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, ...updates } : t)) }
      : w
  );
}

export function toggleTodoItem(data: AppData, boardId: string, widgetId: string, todoId: string): AppData {
  return updateWidgetInBoard(data, boardId, widgetId, (w) =>
    w.type === 'todo'
      ? { ...w, items: w.items.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)) }
      : w
  );
}

export function moveTodoItem(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  todoId: string,
  toIndex: number
): AppData {
  return {
    ...data,
    boards: data.boards.map((b) => {
      if (b.id !== boardId) return b;

      let movedTodo: TodoItem | undefined;
      let originalIndex = -1;
      let widgets = b.widgets.map((w) => {
        if (w.id === fromWidgetId && w.type === 'todo') {
          const idx = w.items.findIndex((t) => t.id === todoId);
          if (idx !== -1) {
            originalIndex = idx;
            movedTodo = w.items[idx];
            return { ...w, items: w.items.filter((t) => t.id !== todoId) };
          }
        }
        return w;
      });

      if (movedTodo) {
        let adjustedIndex = toIndex;
        if (fromWidgetId === toWidgetId && originalIndex < toIndex) {
          adjustedIndex = toIndex - 1;
        }
        widgets = widgets.map((w) => {
          if (w.id === toWidgetId && w.type === 'todo') {
            const items = [...w.items];
            const clampedIndex = Math.min(adjustedIndex, items.length);
            items.splice(clampedIndex, 0, movedTodo!);
            return { ...w, items };
          }
          return w;
        });
      }

      return { ...b, widgets, updatedAt: Date.now() };
    })
  };
}

// Export / Import

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = t('storage.backupFilename', { date: new Date().toISOString().slice(0, 10) });
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.boards || !Array.isArray(parsed.boards) || !parsed.settings) {
          reject(new Error(t('storage.invalidFileFormat')));
          return;
        }
        resolve(parsed as AppData);
      } catch {
        reject(new Error(t('storage.invalidFileParse')));
      }
    };
    reader.onerror = () => reject(new Error(t('storage.errorReadingFile')));
    reader.readAsText(file);
  });
}
